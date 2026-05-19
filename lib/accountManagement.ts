// Account-management primitives shared by admin and self-service routes.
//
// Three lifecycle operations on a Dealer:
//
//   suspend  — soft delete: sets active=false + deletedAt=now. Triggers a
//              Stripe subscription cancellation at period end (no refund,
//              no immediate billing stop). Reversible via `restore` until
//              the 30-day data-retention cron hard-deletes the row.
//
//   restore  — undo soft-delete: clears deletedAt + sets active=true.
//              Does NOT automatically un-cancel the Stripe subscription;
//              caller decides whether to issue a new subscription via the
//              normal checkout flow. (Re-subscribing the same Stripe sub
//              after cancel_at_period_end is messy; cleaner to just create
//              a new one.)
//
//   hardDelete — bypass the 30-day grace: cancel Stripe sub immediately
//                (at_period_end=true is still safest \u2014 we don't refund),
//                then prisma.dealer.delete which cascades through the FK
//                graph (sub-accounts, listings, vehicles, leads, etc).
//                Irreversible. Audit log row is the only record left.
//
// All three operations call writeAuditLog with beforeState/afterState
// snapshots so we can always show "who did what when" in /admin/audit.
//
// Stripe cancellation is idempotent: if the subscription is already
// scheduled-to-cancel or already canceled, we no-op and return cleanly.

import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/adminAudit";

export type AccountAction =
  | "account_suspended"
  | "account_restored"
  | "account_hard_deleted";

export interface ActorContext {
  email: string;
  role: string;
  // Optional: when the dealer triggers their own delete, actorDealerId
  // equals the dealer being acted on. Admin-triggered actions leave this
  // null and instead populate targetDealerId.
  actorDealerId?: string | null;
}

interface StripeCancelResult {
  attempted: boolean;
  cancelled: boolean;
  alreadyScheduled: boolean;
  error?: string;
}

/**
 * Cancel a Stripe subscription at period end. Returns whether the call
 * actually changed state. Safe to call repeatedly \u2014 if the sub is already
 * `cancel_at_period_end=true` or already in a terminal status, we skip.
 */
async function cancelStripeAtPeriodEnd(
  subscriptionId: string | null | undefined
): Promise<StripeCancelResult> {
  if (!subscriptionId) {
    return { attempted: false, cancelled: false, alreadyScheduled: false };
  }
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return {
      attempted: true,
      cancelled: false,
      alreadyScheduled: false,
      error: "STRIPE_SECRET_KEY missing in env",
    };
  }
  const stripe = new Stripe(stripeKey);
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    // Idempotency: skip if already scheduled-to-cancel or terminal.
    if (sub.cancel_at_period_end) {
      return { attempted: true, cancelled: false, alreadyScheduled: true };
    }
    if (
      sub.status === "canceled" ||
      sub.status === "incomplete_expired" ||
      sub.status === "unpaid"
    ) {
      return { attempted: true, cancelled: false, alreadyScheduled: true };
    }
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    return { attempted: true, cancelled: true, alreadyScheduled: false };
  } catch (err) {
    // Stripe returns a typed error; we don't care about the discriminator
    // here, just the message for the audit log.
    return {
      attempted: true,
      cancelled: false,
      alreadyScheduled: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Suspend a dealer. Soft-delete + Stripe-at-period-end cancel.
 *
 * @returns The Dealer row after update plus the Stripe outcome.
 */
export async function suspendDealer(args: {
  dealerId: string;
  actor: ActorContext;
  reason?: string | null;
}): Promise<{
  dealer: { id: string; deletedAt: Date | null; active: boolean };
  stripe: StripeCancelResult;
}> {
  const { dealerId, actor, reason } = args;

  const before = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      id: true,
      name: true,
      email: true,
      slug: true,
      active: true,
      deletedAt: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
    },
  });
  if (!before) {
    throw new Error("dealer_not_found");
  }

  const stripe = await cancelStripeAtPeriodEnd(before.stripeSubscriptionId);

  const after = await prisma.dealer.update({
    where: { id: dealerId },
    data: {
      active: false,
      // Re-set deletedAt to now even if it was already set, so the 30-day
      // grace clock resets on each suspend action.
      deletedAt: new Date(),
    },
    select: { id: true, deletedAt: true, active: true },
  });

  await writeAuditLog({
    action: "account_suspended",
    actorEmail: actor.email,
    actorRole: actor.role,
    actorDealerId: actor.actorDealerId ?? null,
    targetDealerId: dealerId,
    beforeState: {
      active: before.active,
      deletedAt: before.deletedAt,
      subscriptionStatus: before.subscriptionStatus,
    },
    afterState: { active: after.active, deletedAt: after.deletedAt },
    metadata: {
      reason: reason ?? null,
      dealerName: before.name,
      dealerSlug: before.slug,
      stripe,
    },
  });

  return { dealer: after, stripe };
}

/**
 * Restore a suspended dealer. Clears deletedAt + sets active=true.
 * Does NOT auto-resume billing \u2014 see module header.
 */
export async function restoreDealer(args: {
  dealerId: string;
  actor: ActorContext;
}): Promise<{ dealer: { id: string; active: boolean; deletedAt: Date | null } }> {
  const { dealerId, actor } = args;

  const before = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { id: true, name: true, slug: true, active: true, deletedAt: true },
  });
  if (!before) {
    throw new Error("dealer_not_found");
  }
  if (!before.deletedAt && before.active) {
    // Already in a healthy state \u2014 no-op but still audit.
    await writeAuditLog({
      action: "account_restored",
      actorEmail: actor.email,
      actorRole: actor.role,
      actorDealerId: actor.actorDealerId ?? null,
      targetDealerId: dealerId,
      beforeState: { active: before.active, deletedAt: before.deletedAt },
      afterState: { active: true, deletedAt: null },
      metadata: { dealerName: before.name, noop: true },
    });
    return { dealer: { id: dealerId, active: true, deletedAt: null } };
  }

  const after = await prisma.dealer.update({
    where: { id: dealerId },
    data: { active: true, deletedAt: null },
    select: { id: true, active: true, deletedAt: true },
  });

  await writeAuditLog({
    action: "account_restored",
    actorEmail: actor.email,
    actorRole: actor.role,
    actorDealerId: actor.actorDealerId ?? null,
    targetDealerId: dealerId,
    beforeState: { active: before.active, deletedAt: before.deletedAt },
    afterState: { active: after.active, deletedAt: after.deletedAt },
    metadata: { dealerName: before.name, dealerSlug: before.slug },
  });

  return { dealer: after };
}

/**
 * Hard-delete a dealer immediately. Irreversible.
 *
 * Cancels Stripe sub at period end (we never refund here \u2014 if the dealer
 * deserves a refund, do it manually in Stripe before calling this), then
 * deletes the Dealer row. Foreign-key cascades wipe sub-accounts, listings,
 * vehicles, leads, etc. (See prisma schema relations.)
 *
 * Caller is responsible for confirmation UX (we don't gate on a token here
 * because the only callers are admin endpoints that already do the gate).
 */
export async function hardDeleteDealer(args: {
  dealerId: string;
  actor: ActorContext;
  reason?: string | null;
}): Promise<{ deleted: true; stripe: StripeCancelResult }> {
  const { dealerId, actor, reason } = args;

  const before = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      id: true,
      name: true,
      email: true,
      slug: true,
      active: true,
      deletedAt: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
    },
  });
  if (!before) {
    throw new Error("dealer_not_found");
  }

  const stripe = await cancelStripeAtPeriodEnd(before.stripeSubscriptionId);


  // Write the audit log BEFORE deletion so we don't lose the trail when
  // the row vanishes. targetDealerId becomes a dangling reference and that
  // is fine because the audit table has no FK back to Dealer.
  await writeAuditLog({
    action: "account_hard_deleted",
    actorEmail: actor.email,
    actorRole: actor.role,
    actorDealerId: actor.actorDealerId ?? null,
    targetDealerId: dealerId,
    beforeState: {
      active: before.active,
      deletedAt: before.deletedAt,
      subscriptionStatus: before.subscriptionStatus,
    },
    afterState: { hardDeleted: true },
    metadata: {
      reason: reason ?? null,
      dealerName: before.name,
      dealerEmail: before.email,
      dealerSlug: before.slug,
      stripe,
    },
  });

  // Many child relations don't declare onDelete:Cascade in the schema, so
  // we explicitly wipe the dependency graph inside a transaction. Order
  // matters: leaves first, then intermediates, then the Dealer row.
  // Anything we miss here would surface as a Prisma FK error and roll back
  // the whole transaction, so the dealer stays alive (safe failure mode).
  await prisma.$transaction(async (tx) => {
    await tx.lead.deleteMany({ where: { dealerId } });
    await tx.crawlSnapshot.deleteMany({ where: { dealerId } });
    await tx.crawlJob.deleteMany({ where: { dealerId } });
    await tx.metaCatalogSyncItem.deleteMany({ where: { dealerId } });
    await tx.metaDeliveryJob.deleteMany({ where: { dealerId } });
    await tx.metaCustomAudience.deleteMany({ where: { dealerId } });
    await tx.smsMessage.deleteMany({ where: { conversation: { dealerId } } });
    await tx.smsConversation.deleteMany({ where: { dealerId } });
    await tx.teamInvite.deleteMany({ where: { dealerId } });
    await tx.teamUser.deleteMany({ where: { dealerId } });
    await tx.oAuthState.deleteMany({ where: { dealerId } });
    await tx.storefrontUrlChange.deleteMany({ where: { dealerId } });
    await tx.vehicle.deleteMany({ where: { dealerId } });
    await tx.listing.deleteMany({ where: { dealerId } });
    await tx.subAccount.deleteMany({ where: { dealerId } });
    await tx.storefrontBundle.deleteMany({ where: { dealerId } });
    await tx.dealer.delete({ where: { id: dealerId } });
  });

  return { deleted: true, stripe };
}

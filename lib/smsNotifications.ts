/**
 * Helpers for sending proactive SMS notifications to dealers who opted in.
 *
 * Every helper here:
 *   1. Looks up the dealer's SmsConversation.
 *   2. Verifies optedInProactiveAt is set + optedOutAt is null + the
 *      relevant notificationPrefs flag is true.
 *   3. Sends via sendSms() (circuit-breakered) and logs to SmsMessage
 *      with direction='outbound'.
 *
 * If any precondition fails we silently skip. Callers don't need to
 * branch on dealer phone status \u2014 just call the helper and trust it.
 */
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/twilio";

type PrefKey = "weeklyDigest" | "leadAlerts" | "syncAlerts" | "trialAlerts";

/**
 * Send a proactive SMS to a dealer if they're opted in for the given
 * preference. No-op if they aren't.
 */
export async function sendProactiveSms(
  dealerId: string,
  prefKey: PrefKey,
  body: string
): Promise<{ sent: boolean; reason?: string }> {
  const conversation = await prisma.smsConversation.findFirst({
    where: { dealerId },
    select: {
      id: true,
      phoneNumber: true,
      optedInProactiveAt: true,
      optedOutAt: true,
      notificationPrefs: true,
    },
  });

  if (!conversation) return { sent: false, reason: "no_conversation" };
  if (conversation.optedOutAt) return { sent: false, reason: "opted_out" };
  if (!conversation.optedInProactiveAt) return { sent: false, reason: "not_opted_in" };

  const prefs = (conversation.notificationPrefs as Record<string, boolean>) ?? {};
  if (!prefs[prefKey]) return { sent: false, reason: `pref_${prefKey}_disabled` };

  // Log the outbound attempt up-front so a Twilio failure still leaves
  // a trail of what we tried to send.
  const msg = await prisma.smsMessage.create({
    data: {
      conversationId: conversation.id,
      direction: "outbound",
      body,
      status: "queued",
    },
  });

  const result = await sendSms({ to: conversation.phoneNumber, body });

  await prisma.smsMessage.update({
    where: { id: msg.id },
    data: {
      twilioMessageSid: result.sid ?? null,
      status: result.ok ? "sent" : "failed",
      errorMessage: result.error ?? null,
    },
  });

  if (result.ok) {
    await prisma.smsConversation.update({
      where: { id: conversation.id },
      data: { lastOutboundAt: new Date() },
    });
    return { sent: true };
  }

  return { sent: false, reason: result.error };
}

/**
 * Compose the weekly metrics digest body for one dealer.
 *
 * Pulls 7-day rollups:
 *   - new vehicles/listings added
 *   - new leads received
 *   - retargeting audience size growth (sum of estimatedSize delta if
 *     we had snapshots; for v1, just total current size)
 *   - Meta delivery health (success vs failure jobs)
 *
 * Keeps body tight so it fits in 2-3 SMS segments. Long bodies get
 * concatenated by Twilio but cost more per segment.
 */
export async function buildWeeklyDigest(dealerId: string): Promise<string | null> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { name: true, vertical: true, slug: true },
  });
  if (!dealer) return null;

  const [newListings, newVehicles, newLeads, deliveryRuns, audiences] = await Promise.all([
    prisma.listing.count({
      where: { dealerId, createdAt: { gte: sevenDaysAgo }, archivedAt: null },
    }),
    prisma.vehicle.count({
      where: { dealerId, createdAt: { gte: sevenDaysAgo }, archivedAt: null },
    }),
    prisma.lead.count({
      where: { dealerId, createdAt: { gte: sevenDaysAgo } },
    }),
    prisma.metaDeliveryJob.findMany({
      where: { dealerId, lastRunAt: { gte: sevenDaysAgo } },
      select: { lastRunStatus: true },
    }),
    prisma.metaCustomAudience.aggregate({
      where: { dealerId, estimatedSize: { not: null } },
      _sum: { estimatedSize: true },
      _count: true,
    }),
  ]);

  const inventoryAdded = dealer.vertical === "automotive" ? newVehicles : newListings;
  const deliverySuccess = deliveryRuns.filter((r) => r.lastRunStatus === "success").length;
  const deliveryFailure = deliveryRuns.filter((r) => r.lastRunStatus === "failed" || r.lastRunStatus === "error").length;

  // Build a compact body. Empty weeks get a short "nothing happened" message
  // so dealers don't feel bombarded by useless digests.
  if (inventoryAdded === 0 && newLeads === 0 && deliveryRuns.length === 0) {
    return `${dealer.name} \u2014 quiet week. No new listings or leads. Reply STOP to unsubscribe.`;
  }

  const lines: string[] = [`${dealer.name} \u2014 last 7 days:`];
  if (inventoryAdded > 0) {
    lines.push(`\u2022 ${inventoryAdded} new ${dealer.vertical === "automotive" ? "vehicle" : "listing"}${inventoryAdded === 1 ? "" : "s"} added`);
  }
  if (newLeads > 0) {
    lines.push(`\u2022 ${newLeads} new lead${newLeads === 1 ? "" : "s"}`);
  }
  if (deliveryRuns.length > 0) {
    if (deliveryFailure > 0) {
      lines.push(`\u2022 Meta sync: ${deliverySuccess} OK, ${deliveryFailure} failed`);
    } else {
      lines.push(`\u2022 Meta sync: ${deliverySuccess} OK`);
    }
  }
  if (audiences._count > 0 && audiences._sum.estimatedSize) {
    lines.push(`\u2022 Retargeting reach: ~${audiences._sum.estimatedSize.toLocaleString()} people`);
  }
  lines.push("Reply STOP to unsubscribe.");
  return lines.join("\n");
}

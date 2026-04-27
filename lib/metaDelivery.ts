import { prisma } from "@/lib/prisma";
import { loadDealerToken, graphFetch } from "@/lib/meta";
import {
  mapVehicleToRow,
  serializeServicesRow,
  type VehicleForCSV,
  type FeedUrlOpts,
} from "@/lib/csv";
import { randomUUID } from "crypto";

const BATCH_SIZE = 100; // DB cursor batch
const META_BATCH_LIMIT = 5000; // Meta items_batch max per request
const DELETE_BATCH_LIMIT = 5000; // Meta delete batch max per request
const STALE_MIN_AGE_MS = 60 * 60 * 1000; // 1 hour — items must be unseen for at least this long before deletion

// Queue constants
const LEASE_DURATION_MS = 8 * 60 * 1000; // 8 minutes — above Vercel function max runtime (300s)
const DRAIN_BATCH_SIZE = 10; // max jobs per drain run
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000; // 30s base for exponential backoff
const AUTH_FAILURE_THRESHOLD = 3; // consecutive auth failures before blocking

/** Verticals that support API delivery mode. Others must use CSV. */
export const API_SUPPORTED_VERTICALS: ReadonlySet<string> = new Set([
  "automotive",
  "services",
]);

// Graph error codes that indicate token/permission failures
const AUTH_ERROR_CODES = new Set([
  190, // Invalid/expired access token
  200, // Permissions error
  10,  // Application does not have permission
  102, // Session key invalid or no longer valid
]);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DeliveryResult =
  | { mode: "csv"; status: "skipped"; reason: string }
  | { mode: "api"; status: "skipped"; reason: string }
  | { mode: "api"; status: "success"; summary: PushSummary }
  | { mode: "api"; status: "error"; error: string; partialSummary?: PushSummary };

export type PushSummary = {
  batches: number;
  itemsAttempted: number;
  itemsSucceeded: number;
  itemsFailed: number;
  handles: string[];
  warnings: string[];
  errors: string[];
  deleteAttempted?: number;
  deleteSucceeded?: number;
  deleteFailed?: number;
};

export type EnqueueResult =
  | { outcome: "queued"; jobId: string }
  | { outcome: "coalesced"; jobId: string; coalescedCount: number }
  | { outcome: "blocked"; reason: string }
  | { outcome: "skipped"; reason: string };

export type DrainSummary = {
  processed: number;
  succeeded: number;
  retried: number;
  blocked: number;
  skipped: number;
  errors: number;
};

// ---------------------------------------------------------------------------
// Queue: enqueue / coalesce
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES = ["queued", "processing", "retry"];

export async function enqueueDeliveryJob(
  dealerId: string,
  trigger: string
): Promise<EnqueueResult> {
  // Check dealer delivery method — CSV dealers get no-op
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { metaDeliveryMethod: true },
  });

  if (!dealer) {
    return { outcome: "skipped", reason: "dealer_not_found" };
  }

  if (dealer.metaDeliveryMethod === "csv") {
    return { outcome: "skipped", reason: "dealer_mode_csv" };
  }

  // Check for blocked job — but gate on current reconnect state.
  // If the dealer has reconnected (valid token + metaConnectedAt after blockedAt),
  // clear stale blocked rows so enqueue can proceed.
  const blockedJob = await prisma.metaDeliveryJob.findFirst({
    where: { dealerId, status: "blocked" },
    orderBy: { updatedAt: "desc" },
  });

  if (blockedJob) {
    const dealerMeta = await prisma.dealer.findUnique({
      where: { id: dealerId },
      select: { metaAccessToken: true, metaTokenExpiresAt: true, metaConnectedAt: true },
    });

    const hasValidToken =
      !!dealerMeta?.metaAccessToken &&
      (!dealerMeta.metaTokenExpiresAt || dealerMeta.metaTokenExpiresAt > new Date());

    const reconnectedAfterBlock =
      hasValidToken &&
      !!dealerMeta?.metaConnectedAt &&
      !!blockedJob.blockedAt &&
      dealerMeta.metaConnectedAt > blockedJob.blockedAt;

    if (reconnectedAfterBlock) {
      // Dealer reconnected after the block — clear all blocked rows for this dealer
      await prisma.metaDeliveryJob.updateMany({
        where: { dealerId, status: "blocked" },
        data: { status: "failed", lastErrorCode: "unblocked_reconnect" },
      });
    } else {
      return { outcome: "blocked", reason: blockedJob.blockedReason ?? "auth_failure" };
    }
  }

  // Coalesce if an active job already exists for this dealer
  // Exclude processing jobs with expired leases — they are effectively stuck
  const now = new Date();
  const existingJob = await prisma.metaDeliveryJob.findFirst({
    where: {
      dealerId,
      status: { in: ACTIVE_STATUSES },
      OR: [
        { status: { in: ["queued", "retry"] } },
        { status: "processing", leaseExpiresAt: { gte: now } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingJob) {
    const updated = await prisma.metaDeliveryJob.update({
      where: { id: existingJob.id },
      data: { coalescedCount: { increment: 1 } },
    });
    return { outcome: "coalesced", jobId: updated.id, coalescedCount: updated.coalescedCount };
  }

  // Create new job — handle unique constraint violation from concurrent creates
  try {
    const job = await prisma.metaDeliveryJob.create({
      data: {
        dealerId,
        trigger,
        status: "queued",
        nextRunAt: new Date(),
      },
    });
    return { outcome: "queued", jobId: job.id };
  } catch (err: unknown) {
    // Prisma unique constraint violation code: P2002
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      // Another concurrent create won the race — coalesce onto it
      const raceWinner = await prisma.metaDeliveryJob.findFirst({
        where: { dealerId, status: { in: ACTIVE_STATUSES } },
        orderBy: { createdAt: "desc" },
      });
      if (raceWinner) {
        const updated = await prisma.metaDeliveryJob.update({
          where: { id: raceWinner.id },
          data: { coalescedCount: { increment: 1 } },
        });
        return { outcome: "coalesced", jobId: updated.id, coalescedCount: updated.coalescedCount };
      }
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Queue: unblock dealer — explicit reset after reconnect
// ---------------------------------------------------------------------------

export async function unblockDealerJobs(dealerId: string): Promise<number> {
  const result = await prisma.metaDeliveryJob.updateMany({
    where: { dealerId, status: "blocked" },
    data: { status: "failed", lastErrorCode: "unblocked_manual" },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// Queue: claim due jobs with lease
// ---------------------------------------------------------------------------

export async function claimDueJobs(
  limit: number = DRAIN_BATCH_SIZE
): Promise<{ id: string; dealerId: string; leaseToken: string }[]> {
  const now = new Date();
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);

  // Recovery step: transition expired processing leases back to retry
  await prisma.metaDeliveryJob.updateMany({
    where: {
      status: "processing",
      leaseExpiresAt: { lt: now },
    },
    data: {
      status: "retry",
      leaseToken: null,
      leaseExpiresAt: null,
      nextRunAt: now,
    },
  });

  // Find due jobs: (queued or retry) with nextRunAt <= now, no active lease
  const dueJobs = await prisma.metaDeliveryJob.findMany({
    where: {
      status: { in: ["queued", "retry"] },
      nextRunAt: { lte: now },
      OR: [
        { leaseExpiresAt: null },
        { leaseExpiresAt: { lt: now } },
      ],
    },
    orderBy: { nextRunAt: "asc" },
    take: limit,
    select: { id: true, dealerId: true },
  });

  if (dueJobs.length === 0) return [];

  // Claim each job with a lease — skip if already claimed by another worker
  const claimed: { id: string; dealerId: string; leaseToken: string }[] = [];
  const seenDealers = new Set<string>();

  for (const job of dueJobs) {
    // One active execution per dealer
    if (seenDealers.has(job.dealerId)) continue;

    try {
      // Optimistic claim: update only if lease is still free and status is expected
      const claimResult = await prisma.metaDeliveryJob.updateMany({
        where: {
          id: job.id,
          status: { in: ["queued", "retry"] },
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lt: now } },
          ],
        },
        data: {
          status: "processing",
          leaseToken,
          leaseExpiresAt,
        },
      });
      // Only consider claimed if updateMany actually modified a row
      if (claimResult.count === 1) {
        claimed.push({ ...job, leaseToken });
        seenDealers.add(job.dealerId);
      }
    } catch {
      // Concurrent claim — skip
    }
  }

  return claimed;
}

// ---------------------------------------------------------------------------
// Queue: drain worker loop
// ---------------------------------------------------------------------------

/**
 * Lease-guarded job update: uses updateMany with both id and leaseToken
 * in the where clause. Returns true if the update succeeded (lease still
 * owned), false if the lease was lost (another worker reclaimed the job).
 */
async function leaseGuardedUpdate(
  jobId: string,
  leaseToken: string,
  data: Record<string, unknown>
): Promise<boolean> {
  const result = await prisma.metaDeliveryJob.updateMany({
    where: { id: jobId, leaseToken },
    data: { ...data, leaseToken: null, leaseExpiresAt: null },
  });
  return result.count > 0;
}

export async function drainDeliveryQueue(): Promise<DrainSummary> {
  const summary: DrainSummary = {
    processed: 0,
    succeeded: 0,
    retried: 0,
    blocked: 0,
    skipped: 0,
    errors: 0,
  };

  const jobs = await claimDueJobs(DRAIN_BATCH_SIZE);

  for (const job of jobs) {
    summary.processed++;

    // Re-check dealer mode before execution
    const dealer = await prisma.dealer.findUnique({
      where: { id: job.dealerId },
      select: { metaDeliveryMethod: true },
    });

    if (!dealer || dealer.metaDeliveryMethod === "csv") {
      const owned = await leaseGuardedUpdate(job.id, job.leaseToken, {
        status: "skipped",
        lastRunAt: new Date(),
        lastRunStatus: "skipped",
        lastErrorCode: dealer ? "dealer_mode_csv" : "dealer_not_found",
      });
      if (!owned) continue; // lease lost — stop processing this job
      summary.skipped++;
      continue;
    }

    try {
      const result = await deliverFeed(job.dealerId);
      const now = new Date();

      if (result.status === "success" && result.mode === "api") {
        const s = result.summary;
        const owned = await leaseGuardedUpdate(job.id, job.leaseToken, {
          status: "success",
          lastRunAt: now,
          lastRunStatus: "success",
          lastErrorCode: null,
          lastErrorMessage: null,
          lastItemsAttempted: s.itemsAttempted,
          lastItemsSucceeded: s.itemsSucceeded,
          lastItemsFailed: s.itemsFailed,
          lastDeleteAttempted: s.deleteAttempted ?? 0,
          lastDeleteSucceeded: s.deleteSucceeded ?? 0,
          lastDeleteFailed: s.deleteFailed ?? 0,
          consecutiveAuthFailures: 0,
        });
        if (owned) summary.succeeded++;
      } else if (result.status === "skipped") {
        const owned = await leaseGuardedUpdate(job.id, job.leaseToken, {
          status: "skipped",
          lastRunAt: now,
          lastRunStatus: "skipped",
          lastErrorCode: result.reason,
        });
        if (owned) summary.skipped++;
      } else if (result.status === "error") {
        const isAuthError = isAuthRelatedError(result.error);
        const currentJob = await prisma.metaDeliveryJob.findFirst({
          where: { id: job.id, leaseToken: job.leaseToken },
          select: { attemptCount: true, maxAttempts: true, consecutiveAuthFailures: true },
        });

        if (!currentJob) continue; // lease lost

        const attemptCount = currentJob.attemptCount + 1;
        const authFailures = isAuthError
          ? currentJob.consecutiveAuthFailures + 1
          : 0;
        const maxAttempts = currentJob.maxAttempts;

        const sanitizedError = sanitizeErrorText(result.error);
        const sanitizedMessage = result.partialSummary
          ? sanitizeErrorText(result.partialSummary.errors?.slice(0, 3).join("; ") ?? result.error)
          : sanitizedError;

        // Circuit breaker: block after threshold auth failures
        if (authFailures >= AUTH_FAILURE_THRESHOLD) {
          const owned = await leaseGuardedUpdate(job.id, job.leaseToken, {
            status: "blocked",
            attemptCount,
            consecutiveAuthFailures: authFailures,
            blockedAt: now,
            blockedReason: sanitizeErrorText(`auth_failure: ${result.error}`),
            lastRunAt: now,
            lastRunStatus: "error",
            lastErrorCode: sanitizedError,
            lastErrorMessage: sanitizedMessage,
          });
          if (owned) summary.blocked++;
          continue;
        }

        // Retry with backoff or fail permanently
        if (attemptCount < maxAttempts) {
          const jitter = Math.random() * 5000;
          const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attemptCount - 1) + jitter;
          const nextRunAt = new Date(now.getTime() + backoffMs);

          const owned = await leaseGuardedUpdate(job.id, job.leaseToken, {
            status: "retry",
            attemptCount,
            consecutiveAuthFailures: authFailures,
            nextRunAt,
            lastRunAt: now,
            lastRunStatus: "error",
            lastErrorCode: sanitizedError,
            lastErrorMessage: sanitizedMessage,
          });
          if (owned) summary.retried++;
        } else {
          const owned = await leaseGuardedUpdate(job.id, job.leaseToken, {
            status: "failed",
            attemptCount,
            consecutiveAuthFailures: authFailures,
            lastRunAt: now,
            lastRunStatus: "error",
            lastErrorCode: sanitizedError,
            lastErrorMessage: sanitizedMessage,
          });
          if (owned) summary.errors++;
        }
      }
    } catch (err) {
      const now = new Date();
      const currentJob = await prisma.metaDeliveryJob.findFirst({
        where: { id: job.id, leaseToken: job.leaseToken },
        select: { attemptCount: true, maxAttempts: true },
      });

      if (!currentJob) continue; // lease lost

      const attemptCount = currentJob.attemptCount + 1;
      const maxAttempts = currentJob.maxAttempts;
      const sanitizedMessage = sanitizeErrorText(
        err instanceof Error ? err.message : String(err)
      );

      if (attemptCount < maxAttempts) {
        const jitter = Math.random() * 5000;
        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attemptCount - 1) + jitter;
        const owned = await leaseGuardedUpdate(job.id, job.leaseToken, {
          status: "retry",
          attemptCount,
          nextRunAt: new Date(now.getTime() + backoffMs),
          lastRunAt: now,
          lastRunStatus: "error",
          lastErrorCode: "exception",
          lastErrorMessage: sanitizedMessage,
        });
        if (owned) summary.retried++;
      } else {
        const owned = await leaseGuardedUpdate(job.id, job.leaseToken, {
          status: "failed",
          attemptCount,
          lastRunAt: now,
          lastRunStatus: "error",
          lastErrorCode: "exception",
          lastErrorMessage: sanitizedMessage,
        });
        if (owned) summary.errors++;
      }
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Error text sanitization — strip tokens, URLs, and sensitive details
// ---------------------------------------------------------------------------

/** Redact token-like substrings, full URLs with query params, and long hex strings. */
export function sanitizeErrorText(text: string): string {
  if (!text) return text;
  let s = text;
  // Strip Bearer/access tokens (long alphanumeric strings often prefixed)
  s = s.replace(/\b(EAA[A-Za-z0-9]{20,})\b/g, "[REDACTED_TOKEN]");
  // Strip generic long hex/base64 tokens (40+ chars)
  s = s.replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, "[REDACTED]");
  // Strip full URLs with query params (keep scheme+host, drop path/query)
  s = s.replace(/https?:\/\/[^\s"']+\?[^\s"']*/g, (match) => {
    try {
      const u = new URL(match);
      return `${u.origin}/[REDACTED_PATH]`;
    } catch {
      return "[REDACTED_URL]";
    }
  });
  // Strip remaining URLs with paths that might contain sensitive info
  s = s.replace(/https?:\/\/graph\.facebook\.com\/[^\s"']*/g, "https://graph.facebook.com/[REDACTED_PATH]");
  return s;
}

// ---------------------------------------------------------------------------
// Auth error classification for circuit breaker
// ---------------------------------------------------------------------------

function isAuthRelatedError(error: string): boolean {
  const authPatterns = [
    "auth", "permission", "token", "unauthorized", "forbidden",
    "meta_token_missing", "meta_token_expired", "meta_token_decrypt_failed",
  ];
  const lower = error.toLowerCase();
  return authPatterns.some((p) => lower.includes(p));
}

// ---------------------------------------------------------------------------
// Shared after() dispatch helper — now uses enqueue semantics
// ---------------------------------------------------------------------------

export function dispatchFeedDeliveryInBackground(
  dealerId: string,
  trigger: string,
  afterFn: (cb: () => Promise<void>) => void
): void {
  afterFn(async () => {
    try {
      const result = await enqueueDeliveryJob(dealerId, trigger);
      console.log(JSON.stringify({
        event: "delivery_job_enqueued",
        dealerId,
        trigger,
        outcome: result.outcome,
        ...("jobId" in result ? { jobId: result.jobId } : {}),
        ...("reason" in result ? { reason: result.reason } : {}),
      }));
    } catch (err) {
      console.error(JSON.stringify({
        event: "delivery_job_enqueue_exception",
        dealerId,
        trigger,
        message: err instanceof Error ? err.message : String(err),
      }));
    }
  });
}

/** @deprecated Use dispatchFeedDeliveryInBackground */
export const scheduleDelivery = dispatchFeedDeliveryInBackground;

// ---------------------------------------------------------------------------
// Pushability filters (shared with status route readiness checks)
// ---------------------------------------------------------------------------

export function isAutomotivePushable(v: {
  imageUrl?: string | null;
  images?: unknown;
  url?: string | null;
}): boolean {
  const hasImage = !!(v.imageUrl || (v.images && (v.images as string[]).length > 0));
  const hasUrl = !!v.url;
  return hasUrl || hasImage;
}

export function isServicesPushable(listing: {
  imageUrls: string[];
}): boolean {
  const firstImage = listing.imageUrls[0];
  return !!firstImage && firstImage !== "https://placehold.co/600x400?text=No+Image";
}

// ---------------------------------------------------------------------------
// Catalog item ID resolver — extracts the identifier sent to Meta
// ---------------------------------------------------------------------------

function resolveCatalogItemId(
  row: Record<string, unknown>,
  vertical: string
): string | null {
  if (vertical === "automotive") {
    const vid = row["vehicle_id"];
    return typeof vid === "string" && vid ? vid : null;
  }
  if (vertical === "services") {
    const id = row["id"];
    return typeof id === "string" && id ? id : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// deliverFeed — top-level dispatcher
// ---------------------------------------------------------------------------

export async function deliverFeed(
  dealerId: string,
  items?: unknown[]
): Promise<DeliveryResult> {
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      metaDeliveryMethod: true,
      metaCatalogId: true,
      metaAccessToken: true,
      vertical: true,
      slug: true,
      feedUrlMode: true,
      address: true,
      metaTokenExpiresAt: true,
    },
  });

  if (!dealer) {
    return { mode: "api", status: "error", error: "dealer_not_found" };
  }

  // CSV mode — skip with reason, legacy CSV path unchanged
  if (dealer.metaDeliveryMethod === "csv") {
    return {
      mode: "csv",
      status: "skipped",
      reason: "Dealer delivery method is CSV; inventory push skipped. CSV feed continues via /feeds/{slug}.",
    };
  }

  // Require explicit "api" opt-in (Comment 4)
  if (dealer.metaDeliveryMethod !== "api") {
    return {
      mode: "api",
      status: "skipped",
      reason: `Dealer delivery method "${dealer.metaDeliveryMethod ?? "unset"}" is not a recognized mode. Set to "api" or "csv".`,
    };
  }

  // Preflight checks for API mode
  if (!dealer.metaCatalogId) {
    return { mode: "api", status: "error", error: "meta_catalog_not_selected" };
  }
  if (!dealer.metaAccessToken) {
    return { mode: "api", status: "error", error: "meta_token_missing" };
  }
  if (dealer.metaTokenExpiresAt && dealer.metaTokenExpiresAt < new Date()) {
    return { mode: "api", status: "error", error: "meta_token_expired" };
  }

  const vertical = dealer.vertical;
  if (vertical !== "automotive" && vertical !== "services") {
    return {
      mode: "api",
      status: "error",
      error: `unsupported_vertical: ${vertical}. Only automotive and services are supported in this phase.`,
    };
  }

  // Decrypt token (Comment 6: catch decryption exceptions)
  let token: string | null;
  try {
    token = await loadDealerToken(dealerId);
  } catch {
    return { mode: "api", status: "error", error: "meta_token_decrypt_failed" };
  }
  if (!token) {
    return { mode: "api", status: "error", error: "meta_token_decrypt_failed" };
  }

  // Build feed items (caller-supplied or extracted from DB)
  const feedItems =
    items ??
    (await extractInventory(dealerId, vertical, {
      feedUrlMode: dealer.feedUrlMode ?? "original",
      slug: dealer.slug,
      appBaseUrl: process.env.NEXT_PUBLIC_APP_URL || "https://www.ciafeed.com",
    }));

  if ((feedItems as unknown[]).length === 0) {
    // Safety guard: only allow reconciliation to delete tracked items when
    // there are already tracked sync items (i.e. this is not a brand-new or
    // truly empty catalog). This prevents catastrophic catalog wipes from
    // transient empty-inventory states (e.g. all vehicles archived at once).
    const trackedCount = await prisma.metaCatalogSyncItem.count({
      where: { dealerId, metaCatalogId: dealer.metaCatalogId, lastDeletedAt: null },
    });

    if (trackedCount === 0) {
      // Brand-new dealer or truly empty catalog — nothing to reconcile
      return {
        mode: "api",
        status: "error",
        error: "no_pushable_inventory",
      };
    }

    // Tracked items exist but zero current inventory — run stale reconciliation
    // with an empty active set so tracked items get cleaned up. The stale age
    // guard inside reconcileStaleItems prevents wiping from transient states.
    const activeItemIds = new Set<string>();
    const deleteSummary = await reconcileStaleItems(
      dealerId,
      dealer.metaCatalogId,
      vertical,
      activeItemIds,
      token
    );

    const summary = makeEmptySummary();
    summary.deleteAttempted = deleteSummary.deleteAttempted;
    summary.deleteSucceeded = deleteSummary.deleteSucceeded;
    summary.deleteFailed = deleteSummary.deleteFailed;

    return {
      mode: "api",
      status: "success",
      summary,
    };
  }

  const typedItems = feedItems as Record<string, unknown>[];

  // Collect active catalog item IDs for sync state tracking
  const activeItemIds = new Set<string>();
  for (const row of typedItems) {
    const itemId = resolveCatalogItemId(row, vertical);
    if (itemId) activeItemIds.add(itemId);
  }

  // Send upsert batches
  const result = await sendBatchesToMeta(
    dealer.metaCatalogId,
    token,
    typedItems
  );

  // After fully successful upsert, persist sync state and reconcile stale items.
  // On partial success we skip sync/reconcile because sendBatchesToMeta does not
  // return per-item success info, so we cannot safely mark items as "seen".
  if (result.status === "success") {
    await persistSyncState(dealerId, dealer.metaCatalogId, vertical, activeItemIds);

    const deleteSummary = await reconcileStaleItems(
      dealerId,
      dealer.metaCatalogId,
      vertical,
      activeItemIds,
      token
    );

    result.summary.deleteAttempted = deleteSummary.deleteAttempted;
    result.summary.deleteSucceeded = deleteSummary.deleteSucceeded;
    result.summary.deleteFailed = deleteSummary.deleteFailed;
  } else if (result.status === "error" && result.partialSummary && result.partialSummary.itemsSucceeded > 0) {
    console.warn({
      event: "reconciliation_skipped_partial_success",
      dealerId,
      metaCatalogId: dealer.metaCatalogId,
      itemsSucceeded: result.partialSummary.itemsSucceeded,
      itemsFailed: result.partialSummary.itemsFailed,
      reason: "Sync state persistence and reconciliation skipped due to partial batch failure.",
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// pushInventoryToMeta — dealer-based public API (Comment 5)
// ---------------------------------------------------------------------------

/**
 * Lower-level escape hatch that sends caller-supplied items to Meta without
 * managing sync state. Unlike `deliverFeed`, this function does NOT call
 * `persistSyncState` or `reconcileStaleItems`, so:
 *
 * - Stale items will not be tracked or cleaned up for items pushed via this path.
 * - The returned `PushSummary` will not contain meaningful `deleteAttempted`,
 *   `deleteSucceeded`, or `deleteFailed` values (they will be 0 or undefined).
 *
 * Callers that need full sync-state lifecycle should use `deliverFeed` instead.
 */
export async function pushInventoryToMeta(
  dealerId: string,
  items: Record<string, unknown>[]
): Promise<DeliveryResult> {
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      metaCatalogId: true,
      metaAccessToken: true,
      metaTokenExpiresAt: true,
    },
  });

  if (!dealer) {
    return { mode: "api", status: "error", error: "dealer_not_found" };
  }
  if (!dealer.metaCatalogId) {
    return { mode: "api", status: "error", error: "meta_catalog_not_selected" };
  }
  if (!dealer.metaAccessToken) {
    return { mode: "api", status: "error", error: "meta_token_missing" };
  }
  if (dealer.metaTokenExpiresAt && dealer.metaTokenExpiresAt < new Date()) {
    return { mode: "api", status: "error", error: "meta_token_expired" };
  }

  let token: string | null;
  try {
    token = await loadDealerToken(dealerId);
  } catch {
    return { mode: "api", status: "error", error: "meta_token_decrypt_failed" };
  }
  if (!token) {
    return { mode: "api", status: "error", error: "meta_token_decrypt_failed" };
  }

  if (items.length === 0) {
    return { mode: "api", status: "error", error: "no_pushable_inventory" };
  }

  return sendBatchesToMeta(dealer.metaCatalogId, token, items);
}

// ---------------------------------------------------------------------------
// extractInventory — mirrors CSV route filtering + mapping
// ---------------------------------------------------------------------------

async function extractInventory(
  dealerId: string,
  vertical: string,
  feedUrlOpts: FeedUrlOpts
): Promise<Record<string, unknown>[]> {
  if (vertical === "automotive") {
    return extractAutomotiveInventory(dealerId, feedUrlOpts);
  }
  if (vertical === "services") {
    return extractServicesInventory(dealerId, feedUrlOpts);
  }
  return [];
}

async function extractAutomotiveInventory(
  dealerId: string,
  feedUrlOpts: FeedUrlOpts
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | undefined;

  while (true) {
    const batch = await prisma.vehicle.findMany({
      where: { dealerId, archivedAt: null },
      include: {
        dealer: {
          select: {
            name: true,
            address: true,
            fbPageId: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    for (const v of batch) {
      if (!isAutomotivePushable(v)) continue;
      rows.push(mapVehicleToRow(v as VehicleForCSV, feedUrlOpts));
    }

    if (batch.length < BATCH_SIZE) break;
    cursor = batch[batch.length - 1].id;
  }

  return rows;
}

async function extractServicesInventory(
  dealerId: string,
  feedUrlOpts: FeedUrlOpts
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | undefined;

  while (true) {
    const batch = await prisma.listing.findMany({
      where: {
        dealerId,
        vertical: "services",
        archivedAt: null,
        publishStatus: "published",
      },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    for (const listing of batch) {
      if (!isServicesPushable(listing)) continue;
      const data = listing.data as Record<string, unknown>;
      rows.push(serializeServicesRow({ ...listing, data }, feedUrlOpts));
    }

    if (batch.length < BATCH_SIZE) break;
    cursor = batch[batch.length - 1].id;
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Sync state persistence
// ---------------------------------------------------------------------------

const SYNC_BATCH_SIZE = 50;

async function persistSyncState(
  dealerId: string,
  metaCatalogId: string,
  entityType: string,
  activeItemIds: Set<string>
): Promise<void> {
  const now = new Date();
  const items = [...activeItemIds];

  for (let i = 0; i < items.length; i += SYNC_BATCH_SIZE) {
    const chunk = items.slice(i, i + SYNC_BATCH_SIZE);
    const results = await Promise.allSettled(
      chunk.map((catalogItemId) =>
        prisma.metaCatalogSyncItem.upsert({
          where: {
            dealerId_metaCatalogId_catalogItemId: {
              dealerId,
              metaCatalogId,
              catalogItemId,
            },
          },
          create: {
            dealerId,
            metaCatalogId,
            entityType,
            catalogItemId,
            lastSeenAt: now,
            lastDeletedAt: null,
          },
          update: {
            lastSeenAt: now,
            lastDeletedAt: null, // Clear deletion mark if item reappears
            entityType,
          },
        })
      )
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "rejected") {
        console.error({
          event: "sync_state_persist_error",
          dealerId,
          catalogItemId: chunk[j],
          message: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Stale item reconciliation — detect + delete from Meta
// ---------------------------------------------------------------------------

export async function reconcileStaleItems(
  dealerId: string,
  metaCatalogId: string,
  entityType: string,
  activeItemIds: Set<string>,
  token: string
): Promise<{ deleteAttempted: number; deleteSucceeded: number; deleteFailed: number }> {
  const result = { deleteAttempted: 0, deleteSucceeded: 0, deleteFailed: 0 };

  // Find tracked items that are NOT in the current active set and NOT already deleted.
  // Apply a minimum stale age guard: only delete items whose lastSeenAt is older than
  // STALE_MIN_AGE_MS. This prevents catastrophic wipes from transient empty-inventory
  // states (e.g. all vehicles archived at once and then restored shortly after).
  const staleAgeCutoff = new Date(Date.now() - STALE_MIN_AGE_MS);
  const staleItems = await prisma.metaCatalogSyncItem.findMany({
    where: {
      dealerId,
      metaCatalogId,
      entityType,
      lastDeletedAt: null,
      lastSeenAt: { lt: staleAgeCutoff },
      ...(activeItemIds.size > 0
        ? { catalogItemId: { notIn: [...activeItemIds] } }
        : {}),
    },
    select: { id: true, catalogItemId: true },
  });

  if (staleItems.length === 0) return result;

  // Batch delete requests to Meta
  for (let i = 0; i < staleItems.length; i += DELETE_BATCH_LIMIT) {
    const batch = staleItems.slice(i, i + DELETE_BATCH_LIMIT);
    result.deleteAttempted += batch.length;

    const payload = {
      requests: batch.map((item) => ({
        method: "DELETE",
        data: { id: item.catalogItemId },
      })),
    };

    try {
      const res = await graphFetch(
        `/${metaCatalogId}/items_batch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        token
      );

      if (res.ok) {
        // Parse the response to determine per-item outcomes.
        // Meta items_batch may return handle-based async results or
        // validation_status with per-item errors even on HTTP 200.
        let body: {
          handles?: string[];
          validation_status?: unknown;
        } = {};
        try {
          body = await res.json();
        } catch {
          // Could not parse response — treat entire batch as unknown/failed
          // to avoid marking items that may not have been deleted.
          console.error({
            event: "meta_delete_batch_parse_error",
            dealerId,
            metaCatalogId,
            batchSize: batch.length,
          });
          result.deleteFailed += batch.length;
          continue;
        }

        // If response contains handles, the operation is async regardless of
        // whether validation_status is also present. Resolve via
        // check_batch_request_status before marking anything deleted.
        if (body.handles && body.handles.length > 0) {
          const handleResult = await resolveDeleteHandles(
            metaCatalogId,
            token,
            body.handles,
            batch,
            dealerId
          );
          result.deleteSucceeded += handleResult.succeeded;
          result.deleteFailed += handleResult.failed;
          continue;
        }

        // Non-handle response — extract per-item failures from validation_status.
        // Support both object form { errors: [...] } and array form [...].
        const { failedIds: failedItemIds, unmappedErrorCount } =
          extractFailedItemIds(body.validation_status);

        // Partition batch into succeeded and failed
        const succeededRows: string[] = [];
        const failedRows: typeof batch = [];
        for (const item of batch) {
          if (failedItemIds.has(item.catalogItemId)) {
            failedRows.push(item);
          } else {
            succeededRows.push(item.id);
          }
        }

        // If there are unmapped errors, we cannot confirm which items they
        // belong to. Conservatively pull items from succeeded back to failed
        // so counters stay accurate and those rows remain undeleted for retry.
        let adjustedSucceeded = succeededRows.length;
        let adjustedFailed = failedRows.length;
        if (unmappedErrorCount > 0) {
          const pullBack = Math.min(unmappedErrorCount, succeededRows.length);
          // Remove the last `pullBack` items from succeededRows — they remain
          // undeleted (no lastDeletedAt written) for safety.
          const demotedIds = succeededRows.splice(
            succeededRows.length - pullBack,
            pullBack
          );
          adjustedSucceeded = succeededRows.length;
          adjustedFailed = failedRows.length + demotedIds.length;
        }

        // Mark only confirmed-deleted items
        if (succeededRows.length > 0) {
          const now = new Date();
          await prisma.metaCatalogSyncItem.updateMany({
            where: { id: { in: succeededRows } },
            data: { lastDeletedAt: now },
          });
        }

        result.deleteSucceeded += adjustedSucceeded;
        result.deleteFailed += adjustedFailed;

        if (failedRows.length > 0) {
          console.warn({
            event: "meta_delete_batch_partial_failure",
            dealerId,
            metaCatalogId,
            failedCount: failedRows.length,
            failedIds: failedRows.map((r) => r.catalogItemId),
          });
        }
      } else {
        // Try to parse error for logging
        let errorDetail: string;
        try {
          const errorBody = await res.json();
          errorDetail = errorBody?.error?.message || JSON.stringify(errorBody);
        } catch {
          errorDetail = `HTTP ${res.status}`;
        }
        console.error({
          event: "meta_delete_batch_error",
          dealerId,
          metaCatalogId,
          batchSize: batch.length,
          error: errorDetail,
        });
        result.deleteFailed += batch.length;
      }
    } catch (err) {
      console.error({
        event: "meta_delete_batch_network_error",
        dealerId,
        metaCatalogId,
        batchSize: batch.length,
        message: err instanceof Error ? err.message : String(err),
      });
      result.deleteFailed += batch.length;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Handle resolution — query check_batch_request_status for async deletes
// ---------------------------------------------------------------------------

async function resolveDeleteHandles(
  metaCatalogId: string,
  token: string,
  handles: string[],
  batch: { id: string; catalogItemId: string }[],
  dealerId: string
): Promise<{ succeeded: number; failed: number }> {
  const failedItemIds = new Set<string>();
  let resolved = false;

  for (const handle of handles) {
    try {
      const encodedHandle = encodeURIComponent(handle);
      const statusRes = await graphFetch(
        `/${metaCatalogId}/check_batch_request_status?handle=${encodedHandle}`,
        {},
        token
      );

      if (!statusRes.ok) {
        // Cannot confirm completion — treat entire batch as failed
        console.warn({
          event: "meta_delete_handle_status_error",
          dealerId,
          metaCatalogId,
          handle,
          status: statusRes.status,
        });
        return { succeeded: 0, failed: batch.length };
      }

      const statusBody = await statusRes.json();

      // check_batch_request_status returns status: "finished" when complete
      if (statusBody.status !== "finished") {
        console.warn({
          event: "meta_delete_batch_handle_pending",
          dealerId,
          metaCatalogId,
          handle,
          batchStatus: statusBody.status,
          batchSize: batch.length,
        });
        return { succeeded: 0, failed: batch.length };
      }

      resolved = true;

      // Extract failed IDs from status response errors/invalid_requests
      if (statusBody.errors) {
        const errors = Array.isArray(statusBody.errors)
          ? statusBody.errors
          : [statusBody.errors];
        for (const err of errors) {
          const itemId =
            (err as Record<string, unknown>)?.retailer_id ??
            (err as Record<string, unknown>)?.id;
          if (typeof itemId === "string" && itemId) failedItemIds.add(itemId);
        }
      }
      if (Array.isArray(statusBody.invalid_requests)) {
        for (const req of statusBody.invalid_requests) {
          const itemId =
            (req as Record<string, unknown>)?.retailer_id ??
            (req as Record<string, unknown>)?.id;
          if (typeof itemId === "string" && itemId) failedItemIds.add(itemId);
        }
      }

      // Also check embedded validation_status
      if (statusBody.validation_status) {
        const { failedIds: vsFailedIds } = extractFailedItemIds(
          statusBody.validation_status
        );
        for (const id of vsFailedIds) failedItemIds.add(id);
      }
    } catch (err) {
      console.warn({
        event: "meta_delete_handle_resolve_error",
        dealerId,
        metaCatalogId,
        handle,
        message: err instanceof Error ? err.message : String(err),
      });
      return { succeeded: 0, failed: batch.length };
    }
  }

  if (!resolved) {
    // No handles were successfully resolved — treat all as failed
    return { succeeded: 0, failed: batch.length };
  }

  // Partition batch based on resolved failures
  const succeededRows: string[] = [];
  const failedRows: string[] = [];
  for (const item of batch) {
    if (failedItemIds.has(item.catalogItemId)) {
      failedRows.push(item.catalogItemId);
    } else {
      succeededRows.push(item.id);
    }
  }

  if (succeededRows.length > 0) {
    const now = new Date();
    await prisma.metaCatalogSyncItem.updateMany({
      where: { id: { in: succeededRows } },
      data: { lastDeletedAt: now },
    });
  }

  if (failedRows.length > 0) {
    console.warn({
      event: "meta_delete_handle_partial_failure",
      dealerId,
      metaCatalogId,
      failedCount: failedRows.length,
      failedIds: failedRows,
    });
  }

  return { succeeded: succeededRows.length, failed: failedRows.length };
}

// ---------------------------------------------------------------------------
// Validation status parser — supports object and array shapes
// ---------------------------------------------------------------------------

function extractFailedItemIds(
  validationStatus: unknown
): { failedIds: Set<string>; unmappedErrorCount: number } {
  const failedIds = new Set<string>();
  if (!validationStatus) return { failedIds, unmappedErrorCount: 0 };

  // Normalize to an array of error entries.
  // Object form: { errors: [ { retailer_id, id, message } ] }
  // Array form:  [ { retailer_id, id, message, ... } ]
  let errorEntries: unknown[] = [];

  if (Array.isArray(validationStatus)) {
    errorEntries = validationStatus;
  } else if (
    typeof validationStatus === "object" &&
    validationStatus !== null
  ) {
    const vs = validationStatus as Record<string, unknown>;
    if (Array.isArray(vs.errors)) {
      errorEntries = vs.errors;
    }
  }

  let unmappedErrorCount = 0;
  for (const entry of errorEntries) {
    if (typeof entry !== "object" || entry === null) {
      unmappedErrorCount++;
      continue;
    }
    const rec = entry as Record<string, unknown>;
    const itemId = rec.retailer_id ?? rec.id;
    if (typeof itemId === "string" && itemId) {
      failedIds.add(itemId);
    } else {
      // Error entry with no extractable item ID — conservatively count
      // as an unconfirmed failure for accurate counters.
      unmappedErrorCount++;
    }
  }

  return { failedIds, unmappedErrorCount };
}

// ---------------------------------------------------------------------------
// sendBatchesToMeta — internal items_batch engine (Comment 1 + 5)
// ---------------------------------------------------------------------------

function makeEmptySummary(): PushSummary {
  return {
    batches: 0,
    itemsAttempted: 0,
    itemsSucceeded: 0,
    itemsFailed: 0,
    handles: [],
    warnings: [],
    errors: [],
    deleteAttempted: 0,
    deleteSucceeded: 0,
    deleteFailed: 0,
  };
}

function isGraphAuthError(body: { error?: { code?: number; error_subcode?: number } }): boolean {
  const code = body?.error?.code;
  if (code !== undefined && AUTH_ERROR_CODES.has(code)) return true;
  return false;
}

async function sendBatchesToMeta(
  catalogId: string,
  token: string,
  items: Record<string, unknown>[]
): Promise<DeliveryResult> {
  const summary = makeEmptySummary();

  // Chunk items into META_BATCH_LIMIT-sized batches
  const chunks: Record<string, unknown>[][] = [];
  for (let i = 0; i < items.length; i += META_BATCH_LIMIT) {
    chunks.push(items.slice(i, i + META_BATCH_LIMIT));
  }

  for (const chunk of chunks) {
    summary.batches++;
    summary.itemsAttempted += chunk.length;

    const payload = {
      allow_upsert: true,
      requests: chunk.map((item) => ({
        method: "UPDATE",
        data: item,
      })),
    };

    let res: Response;
    try {
      res = await graphFetch(
        `/${catalogId}/items_batch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        token
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`Batch ${summary.batches} network error: ${msg}`);
      return {
        mode: "api",
        status: "error",
        error: `Network error on batch ${summary.batches}`,
        partialSummary: summary,
      };
    }

    if (!res.ok) {
      let errorDetail: string;
      let errorBody: { error?: { code?: number; error_subcode?: number; message?: string } } = {};
      try {
        errorBody = await res.json();
        errorDetail = errorBody?.error?.message || JSON.stringify(errorBody);
      } catch {
        errorDetail = `HTTP ${res.status}`;
      }
      summary.errors.push(`Batch ${summary.batches}: ${errorDetail}`);

      // Fail fast on auth/permission errors — check Graph error.code (Comment 1)
      if (
        res.status === 401 ||
        res.status === 403 ||
        isGraphAuthError(errorBody)
      ) {
        return {
          mode: "api",
          status: "error",
          error: `Auth/permission failure: ${errorDetail}`,
          partialSummary: summary,
        };
      }

      // For other errors, record and continue to next batch
      summary.itemsFailed += chunk.length;
      continue;
    }

    // Parse successful response
    let body: {
      handles?: string[];
      validation_status?: {
        errors?: { message: string }[];
        warnings?: { message: string }[];
      };
    };
    try {
      body = await res.json();
    } catch {
      summary.itemsSucceeded += chunk.length;
      continue;
    }

    if (body.handles) {
      summary.handles.push(...body.handles);
    }

    // Collect validation warnings/errors
    if (body.validation_status?.warnings) {
      for (const w of body.validation_status.warnings) {
        if (summary.warnings.length < 20) {
          summary.warnings.push(w.message);
        }
      }
    }
    if (body.validation_status?.errors) {
      const batchErrors = body.validation_status.errors;
      summary.itemsFailed += batchErrors.length;
      summary.itemsSucceeded += chunk.length - batchErrors.length;
      for (const e of batchErrors) {
        if (summary.errors.length < 20) {
          summary.errors.push(e.message);
        }
      }
    } else {
      summary.itemsSucceeded += chunk.length;
    }
  }

  // Prevent false-positive success when no batch succeeded (Comment 1)
  if (summary.itemsSucceeded === 0 && summary.itemsFailed > 0) {
    return {
      mode: "api",
      status: "error",
      error: "all_batches_failed",
      partialSummary: summary,
    };
  }

  return { mode: "api", status: "success", summary };
}

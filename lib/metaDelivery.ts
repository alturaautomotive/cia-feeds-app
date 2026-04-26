import { prisma } from "@/lib/prisma";
import { loadDealerToken, graphFetch } from "@/lib/meta";
import {
  mapVehicleToRow,
  serializeServicesRow,
  type VehicleForCSV,
  type FeedUrlOpts,
} from "@/lib/csv";

const BATCH_SIZE = 100; // DB cursor batch
const META_BATCH_LIMIT = 5000; // Meta items_batch max per request
const DELETE_BATCH_LIMIT = 5000; // Meta delete batch max per request

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

// ---------------------------------------------------------------------------
// Shared after() dispatch helper — logs non-exception failures
// ---------------------------------------------------------------------------

export function dispatchFeedDeliveryInBackground(
  dealerId: string,
  trigger: string,
  afterFn: (cb: () => Promise<void>) => void
): void {
  afterFn(async () => {
    try {
      const result = await deliverFeed(dealerId);
      if (result.status === "error") {
        console.error(JSON.stringify({
          event: "deliver_feed_error",
          dealerId,
          trigger,
          mode: result.mode,
          error: result.error,
          partialSummary: "partialSummary" in result ? result.partialSummary : undefined,
        }));
      } else if (result.status === "skipped") {
        console.warn(JSON.stringify({
          event: "deliver_feed_skipped",
          dealerId,
          trigger,
          mode: result.mode,
          reason: result.reason,
        }));
      } else if (result.status === "success") {
        console.log(JSON.stringify({
          event: "deliver_feed_success",
          dealerId,
          trigger,
          mode: result.mode,
          batches: result.summary.batches,
          itemsAttempted: result.summary.itemsAttempted,
          itemsSucceeded: result.summary.itemsSucceeded,
          itemsFailed: result.summary.itemsFailed,
          deleteAttempted: result.summary.deleteAttempted,
          deleteSucceeded: result.summary.deleteSucceeded,
          deleteFailed: result.summary.deleteFailed,
        }));
      }
    } catch (err) {
      console.error(JSON.stringify({
        event: "deliver_feed_exception",
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

    // There are tracked items but zero current inventory — skip reconciliation
    // to avoid wiping the entire catalog from a transient empty state.
    console.warn({
      event: "reconciliation_skipped_empty_inventory",
      dealerId,
      metaCatalogId: dealer.metaCatalogId,
      trackedCount,
      reason: "Zero pushable inventory with existing tracked items; skipping stale reconciliation as safety measure.",
    });
    return {
      mode: "api",
      status: "error",
      error: "no_pushable_inventory",
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

  // Find tracked items that are NOT in the current active set and NOT already deleted
  const staleItems = await prisma.metaCatalogSyncItem.findMany({
    where: {
      dealerId,
      metaCatalogId,
      entityType,
      lastDeletedAt: null,
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
        // Mark all items in this batch as deleted
        const now = new Date();
        const deletedIds = batch.map((item) => item.id);
        await prisma.metaCatalogSyncItem.updateMany({
          where: { id: { in: deletedIds } },
          data: { lastDeletedAt: now },
        });
        result.deleteSucceeded += batch.length;
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

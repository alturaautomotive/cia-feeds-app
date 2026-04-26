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
    return {
      mode: "api",
      status: "error",
      error: "no_pushable_inventory",
    };
  }

  return sendBatchesToMeta(
    dealer.metaCatalogId,
    token,
    feedItems as Record<string, unknown>[]
  );
}

// ---------------------------------------------------------------------------
// pushInventoryToMeta — dealer-based public API (Comment 5)
// ---------------------------------------------------------------------------

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
// sendBatchesToMeta — internal items_batch engine (Comment 1 + 5)
// ---------------------------------------------------------------------------

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
  const summary: PushSummary = {
    batches: 0,
    itemsAttempted: 0,
    itemsSucceeded: 0,
    itemsFailed: 0,
    handles: [],
    warnings: [],
    errors: [],
  };

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

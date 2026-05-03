import { NextResponse } from "next/server";
import { authGuard, loadDealerToken, graphFetch } from "@/lib/meta";
import { prisma } from "@/lib/prisma";
import { isAutomotivePushable, isServicesPushable, sanitizeErrorText } from "@/lib/metaDelivery";

export async function GET(request: Request) {
  const guard = await authGuard();
  if (!guard.ok) return guard.response;

  const dealer = await prisma.dealer.findUnique({
    where: { id: guard.dealerId },
    select: {
      metaDeliveryMethod: true,
      metaCatalogId: true,
      metaAccessToken: true,
      metaTokenExpiresAt: true,
      vertical: true,
      slug: true,
    },
  });

  if (!dealer) {
    return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
  }

  // Token validity — wrap decryption in try/catch (Comment 6)
  let tokenValid = false;
  if (
    dealer.metaAccessToken &&
    (!dealer.metaTokenExpiresAt || dealer.metaTokenExpiresAt > new Date())
  ) {
    try {
      const token = await loadDealerToken(guard.dealerId);
      tokenValid = !!token;
    } catch {
      tokenValid = false;
    }
  }

  // Readiness checks
  const readiness: Record<string, boolean> = {
    tokenPresent: !!dealer.metaAccessToken,
    tokenValid,
    catalogSelected: !!dealer.metaCatalogId,
    deliveryModeApi: dealer.metaDeliveryMethod === "api",
    supportedVertical:
      dealer.vertical === "automotive" || dealer.vertical === "services",
  };

  // Check pushable inventory using same filters as deliverFeed (Comment 3)
  let inventoryCount = 0;
  if (dealer.vertical === "automotive") {
    const vehicles = await prisma.vehicle.findMany({
      where: { dealerId: guard.dealerId, archivedAt: null },
      select: { imageUrl: true, images: true, url: true },
    });
    inventoryCount = vehicles.filter((v) => isAutomotivePushable(v)).length;
  } else if (dealer.vertical === "services") {
    const listings = await prisma.listing.findMany({
      where: {
        dealerId: guard.dealerId,
        vertical: "services",
        archivedAt: null,
        publishStatus: "published",
      },
      select: { imageUrls: true },
    });
    inventoryCount = listings.filter((l) => isServicesPushable(l)).length;
  }
  readiness.hasInventory = inventoryCount > 0;

  // Queue state, last-run health, and circuit breaker — run in parallel
  const [activeJob, lastRunJob, blockedJob] = await Promise.all([
    prisma.metaDeliveryJob.findFirst({
      where: {
        dealerId: guard.dealerId,
        status: { in: ["queued", "processing", "retry"] },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        nextRunAt: true,
        attemptCount: true,
        coalescedCount: true,
      },
    }),
    prisma.metaDeliveryJob.findFirst({
      where: {
        dealerId: guard.dealerId,
        lastRunAt: { not: null },
      },
      orderBy: { lastRunAt: "desc" },
      select: {
        lastRunAt: true,
        lastRunStatus: true,
        lastErrorCode: true,
        lastErrorMessage: true,
        lastItemsAttempted: true,
        lastItemsSucceeded: true,
        lastItemsFailed: true,
        lastDeleteAttempted: true,
        lastDeleteSucceeded: true,
        lastDeleteFailed: true,
      },
    }),
    prisma.metaDeliveryJob.findFirst({
      where: { dealerId: guard.dealerId, status: "blocked" },
      orderBy: { updatedAt: "desc" },
      select: {
        blockedAt: true,
        blockedReason: true,
        consecutiveAuthFailures: true,
      },
    }),
  ]);

  const queue = activeJob
    ? {
        jobId: activeJob.id,
        status: activeJob.status,
        nextRunAt: activeJob.nextRunAt,
        attemptCount: activeJob.attemptCount,
        coalescedCount: activeJob.coalescedCount,
      }
    : null;

  const lastRun = lastRunJob
    ? {
        lastRunAt: lastRunJob.lastRunAt,
        lastRunStatus: lastRunJob.lastRunStatus,
        lastErrorCode: lastRunJob.lastErrorCode
          ? sanitizeErrorText(lastRunJob.lastErrorCode)
          : null,
        lastErrorMessage: lastRunJob.lastErrorMessage
          ? sanitizeErrorText(lastRunJob.lastErrorMessage)
          : null,
        itemsAttempted: lastRunJob.lastItemsAttempted,
        itemsSucceeded: lastRunJob.lastItemsSucceeded,
        itemsFailed: lastRunJob.lastItemsFailed,
        deleteAttempted: lastRunJob.lastDeleteAttempted,
        deleteSucceeded: lastRunJob.lastDeleteSucceeded,
        deleteFailed: lastRunJob.lastDeleteFailed,
      }
    : null;

  const circuit = blockedJob
    ? {
        blocked: true,
        needsReconnect: true,
        blockedAt: blockedJob.blockedAt,
        reason: blockedJob.blockedReason
          ? sanitizeErrorText(blockedJob.blockedReason)
          : null,
        consecutiveAuthFailures: blockedJob.consecutiveAuthFailures,
      }
    : {
        blocked: false,
        needsReconnect: false,
      };

  // Fold circuit state into readiness — blocked dealers are never ready
  const notBlocked = !circuit.blocked;
  readiness.notBlocked = notBlocked;
  const ready = Object.values(readiness).every(Boolean);

  // Optional: poll a specific batch handle (Comment 2 — use catalog status edge)
  const url = new URL(request.url);
  const handle = url.searchParams.get("handle");
  let batchStatus: unknown = null;

  if (handle && dealer.metaCatalogId && tokenValid) {
    let token: string | null = null;
    try {
      token = await loadDealerToken(guard.dealerId);
    } catch {
      batchStatus = { error: "meta_token_decrypt_failed" };
    }

    if (token && !batchStatus) {
      try {
        const encodedHandle = encodeURIComponent(handle);
        const res = await graphFetch(
          `/${dealer.metaCatalogId}/check_batch_request_status?handle=${encodedHandle}`,
          {},
          token
        );
        if (res.ok) {
          batchStatus = await res.json();
        } else {
          let detail: string;
          try {
            const body = await res.json();
            detail = body?.error?.message || `HTTP ${res.status}`;
          } catch {
            detail = `HTTP ${res.status}`;
          }
          batchStatus = { error: detail };
        }
      } catch (err) {
        batchStatus = {
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  }

  return NextResponse.json({
    ready,
    readiness,
    inventoryCount,
    vertical: dealer.vertical,
    deliveryMethod: dealer.metaDeliveryMethod,
    queue,
    lastRun,
    circuit,
    ...(batchStatus ? { batchStatus } : {}),
  });
}

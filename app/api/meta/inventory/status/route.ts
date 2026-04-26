import { NextRequest, NextResponse } from "next/server";
import { authGuard, loadDealerToken, graphFetch } from "@/lib/meta";
import { prisma } from "@/lib/prisma";
import { isAutomotivePushable, isServicesPushable } from "@/lib/metaDelivery";

export async function GET(request: NextRequest) {
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

  const ready = Object.values(readiness).every(Boolean);

  // Optional: poll a specific batch handle (Comment 2 — use catalog status edge)
  const handle = request.nextUrl.searchParams.get("handle");
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
    ...(batchStatus ? { batchStatus } : {}),
  });
}

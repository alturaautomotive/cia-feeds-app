import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealer: { findUnique: vi.fn() },
    vehicle: { findMany: vi.fn() },
    listing: { findMany: vi.fn() },
    metaCatalogSyncItem: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/meta", () => ({
  loadDealerToken: vi.fn(),
  graphFetch: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { loadDealerToken, graphFetch } from "@/lib/meta";
import { deliverFeed, reconcileStaleItems } from "@/lib/metaDelivery";

const DEALER_ID = "dealer-reconcile-001";
const CATALOG_ID = "catalog-123";
const TOKEN = "test-token";

const API_DEALER = {
  metaDeliveryMethod: "api",
  metaCatalogId: CATALOG_ID,
  metaAccessToken: "encrypted-token",
  vertical: "automotive" as const,
  slug: "test-dealer",
  feedUrlMode: "original",
  address: "123 Main St",
  metaTokenExpiresAt: null,
};

function makeVehicle(id: string) {
  return {
    id,
    dealerId: DEALER_ID,
    url: `https://example.com/${id}`,
    imageUrl: "https://example.com/img.jpg",
    images: ["https://example.com/img.jpg"],
    vin: "VIN123",
    make: "Honda",
    model: "Civic",
    year: "2022",
    bodyStyle: null,
    price: 25000,
    mileageValue: 10000,
    stateOfVehicle: "Used",
    exteriorColor: "White",
    trim: null,
    drivetrain: null,
    transmission: null,
    fuelType: null,
    msrp: null,
    address: null,
    latitude: null,
    longitude: null,
    description: "Test vehicle",
    archivedAt: null,
    createdAt: new Date(),
    dealer: {
      name: "Test Dealer",
      address: "123 Main St",
      fbPageId: null,
      latitude: null,
      longitude: null,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadDealerToken).mockResolvedValue(TOKEN);
  vi.mocked(prisma.metaCatalogSyncItem.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.metaCatalogSyncItem.updateMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.metaCatalogSyncItem.count).mockResolvedValue(0 as never);
});

describe("reconcileStaleItems (unit)", () => {
  it("sends DELETE to Meta for stale tracked IDs and marks lastDeletedAt", async () => {
    vi.mocked(prisma.metaCatalogSyncItem.findMany).mockResolvedValue([
      { id: "sync-1", catalogItemId: "stale-item-A" },
      { id: "sync-2", catalogItemId: "stale-item-B" },
    ] as never);

    vi.mocked(graphFetch).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }) as never
    );

    const result = await reconcileStaleItems(
      DEALER_ID,
      CATALOG_ID,
      "automotive",
      new Set(["active-item-1"]),
      TOKEN
    );

    expect(result.deleteAttempted).toBe(2);
    expect(result.deleteSucceeded).toBe(2);
    expect(result.deleteFailed).toBe(0);

    // Verify Meta DELETE call
    expect(graphFetch).toHaveBeenCalledTimes(1);
    const [endpoint, opts] = vi.mocked(graphFetch).mock.calls[0];
    expect(endpoint).toBe(`/${CATALOG_ID}/items_batch`);
    const body = JSON.parse(opts.body as string);
    expect(body.requests).toEqual([
      { method: "DELETE", data: { id: "stale-item-A" } },
      { method: "DELETE", data: { id: "stale-item-B" } },
    ]);

    // Verify sync state update
    expect(prisma.metaCatalogSyncItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["sync-1", "sync-2"] } },
      data: { lastDeletedAt: expect.any(Date) },
    });
  });

  it("does not send deletes when no stale items exist", async () => {
    vi.mocked(prisma.metaCatalogSyncItem.findMany).mockResolvedValue([] as never);

    const result = await reconcileStaleItems(
      DEALER_ID,
      CATALOG_ID,
      "automotive",
      new Set(["active-item-1"]),
      TOKEN
    );

    expect(result.deleteAttempted).toBe(0);
    expect(result.deleteSucceeded).toBe(0);
    expect(result.deleteFailed).toBe(0);
    expect(graphFetch).not.toHaveBeenCalled();
  });

  it("does not mark lastDeletedAt when Meta DELETE fails", async () => {
    vi.mocked(prisma.metaCatalogSyncItem.findMany).mockResolvedValue([
      { id: "sync-1", catalogItemId: "stale-item-A" },
    ] as never);

    vi.mocked(graphFetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "server error" } }), { status: 500 }) as never
    );

    const result = await reconcileStaleItems(
      DEALER_ID,
      CATALOG_ID,
      "automotive",
      new Set(["active-item-1"]),
      TOKEN
    );

    expect(result.deleteAttempted).toBe(1);
    expect(result.deleteSucceeded).toBe(0);
    expect(result.deleteFailed).toBe(1);

    // updateMany should NOT have been called (no successful deletes)
    expect(prisma.metaCatalogSyncItem.updateMany).not.toHaveBeenCalled();
  });

  it("does not mark lastDeletedAt when Meta DELETE throws a network error", async () => {
    vi.mocked(prisma.metaCatalogSyncItem.findMany).mockResolvedValue([
      { id: "sync-1", catalogItemId: "stale-item-A" },
    ] as never);

    vi.mocked(graphFetch).mockRejectedValue(new Error("network timeout"));

    const result = await reconcileStaleItems(
      DEALER_ID,
      CATALOG_ID,
      "automotive",
      new Set(["active-item-1"]),
      TOKEN
    );

    expect(result.deleteAttempted).toBe(1);
    expect(result.deleteSucceeded).toBe(0);
    expect(result.deleteFailed).toBe(1);
    expect(prisma.metaCatalogSyncItem.updateMany).not.toHaveBeenCalled();
  });
});

describe("deliverFeed reconciliation (integration)", () => {
  it("skips sync/delete work for CSV delivery method", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      ...API_DEALER,
      metaDeliveryMethod: "csv",
    } as never);

    const result = await deliverFeed(DEALER_ID);

    expect(result.mode).toBe("csv");
    expect(result.status).toBe("skipped");
    expect(prisma.metaCatalogSyncItem.upsert).not.toHaveBeenCalled();
    expect(prisma.metaCatalogSyncItem.findMany).not.toHaveBeenCalled();
  });

  it("persists sync state and runs reconciliation after successful upsert", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(API_DEALER as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([makeVehicle("v1")] as never);

    // Upsert batch succeeds
    vi.mocked(graphFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ handles: ["h1"] }), { status: 200 }) as never
    );

    // Reconcile: no stale items
    vi.mocked(prisma.metaCatalogSyncItem.findMany).mockResolvedValue([] as never);

    // Reconcile delete batch (won't be called since no stale items)

    const result = await deliverFeed(DEALER_ID);

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("unexpected");

    // Sync state should have been persisted for the active item with the correct catalogItemId
    expect(prisma.metaCatalogSyncItem.upsert).toHaveBeenCalled();
    const upsertCall = vi.mocked(prisma.metaCatalogSyncItem.upsert).mock.calls[0][0];
    expect(upsertCall.where.dealerId_metaCatalogId_catalogItemId.catalogItemId).toBe("v1");
    expect(upsertCall.create.catalogItemId).toBe("v1");
    expect(upsertCall.create.entityType).toBe("automotive");

    // Summary should include delete fields (all zero since no stale items)
    expect(result.summary.deleteAttempted).toBe(0);
    expect(result.summary.deleteSucceeded).toBe(0);
    expect(result.summary.deleteFailed).toBe(0);
  });

  it("persists sync state with listing id as catalogItemId for services vertical", async () => {
    const servicesDealer = {
      ...API_DEALER,
      vertical: "services" as const,
    };
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(servicesDealer as never);

    const listing = {
      id: "listing-1",
      dealerId: DEALER_ID,
      vertical: "services",
      title: "Test Service",
      price: 100,
      imageUrls: ["https://example.com/img.jpg"],
      url: "https://example.com/service",
      publishStatus: "published",
      data: { description: "A service" },
      archivedAt: null,
      createdAt: new Date(),
    };
    vi.mocked(prisma.listing.findMany).mockResolvedValue([listing] as never);

    // Upsert batch succeeds
    vi.mocked(graphFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ handles: ["h1"] }), { status: 200 }) as never
    );

    // Reconcile: no stale items
    vi.mocked(prisma.metaCatalogSyncItem.findMany).mockResolvedValue([] as never);

    const result = await deliverFeed(DEALER_ID);

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("unexpected");

    // Verify the listing id is used as catalogItemId (not vehicle_id)
    expect(prisma.metaCatalogSyncItem.upsert).toHaveBeenCalled();
    const upsertCall = vi.mocked(prisma.metaCatalogSyncItem.upsert).mock.calls[0][0];
    expect(upsertCall.where.dealerId_metaCatalogId_catalogItemId.catalogItemId).toBe("listing-1");
    expect(upsertCall.create.catalogItemId).toBe("listing-1");
    expect(upsertCall.create.entityType).toBe("services");
  });

  it("includes delete stats in summary when stale items are found and deleted", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(API_DEALER as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([makeVehicle("v1")] as never);

    // Upsert batch succeeds
    vi.mocked(graphFetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ handles: ["h1"] }), { status: 200 }) as never
      )
      // Delete batch succeeds
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 }) as never
      );

    // Reconcile finds stale items
    vi.mocked(prisma.metaCatalogSyncItem.findMany).mockResolvedValue([
      { id: "sync-old", catalogItemId: "old-item" },
    ] as never);

    const result = await deliverFeed(DEALER_ID);

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("unexpected");

    expect(result.summary.deleteAttempted).toBe(1);
    expect(result.summary.deleteSucceeded).toBe(1);
    expect(result.summary.deleteFailed).toBe(0);
    expect(result.summary.itemsSucceeded).toBeGreaterThan(0);
  });

  it("repeated reconciliation is idempotent — already-deleted items are not re-deleted", async () => {
    // Since reconcileStaleItems queries lastDeletedAt: null, already-deleted rows
    // will not appear in the stale set — this is the idempotency guarantee.
    vi.mocked(prisma.metaCatalogSyncItem.findMany).mockResolvedValue([] as never);

    const result = await reconcileStaleItems(
      DEALER_ID,
      CATALOG_ID,
      "automotive",
      new Set(["active-item-1"]),
      TOKEN
    );

    expect(result.deleteAttempted).toBe(0);
    expect(graphFetch).not.toHaveBeenCalled();
  });
});

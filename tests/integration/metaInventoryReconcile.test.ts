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

  it("only marks successfully deleted items when Meta returns per-item errors on HTTP 200", async () => {
    vi.mocked(prisma.metaCatalogSyncItem.findMany).mockResolvedValue([
      { id: "sync-1", catalogItemId: "item-A" },
      { id: "sync-2", catalogItemId: "item-B" },
      { id: "sync-3", catalogItemId: "item-C" },
    ] as never);

    // HTTP 200 but item-B has a validation error
    vi.mocked(graphFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          validation_status: {
            errors: [{ retailer_id: "item-B", message: "Invalid item" }],
          },
        }),
        { status: 200 }
      ) as never
    );

    const result = await reconcileStaleItems(
      DEALER_ID,
      CATALOG_ID,
      "automotive",
      new Set<string>(),
      TOKEN
    );

    expect(result.deleteAttempted).toBe(3);
    expect(result.deleteSucceeded).toBe(2);
    expect(result.deleteFailed).toBe(1);

    // Only sync-1 and sync-3 should be marked deleted (not sync-2 for item-B)
    expect(prisma.metaCatalogSyncItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["sync-1", "sync-3"] } },
      data: { lastDeletedAt: expect.any(Date) },
    });
  });

  it("treats handle-based response without validation_status as failed for retry", async () => {
    vi.mocked(prisma.metaCatalogSyncItem.findMany).mockResolvedValue([
      { id: "sync-1", catalogItemId: "item-A" },
    ] as never);

    // HTTP 200 with only a handle — async processing, outcome unknown
    // items_batch returns handle
    vi.mocked(graphFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ handles: ["handle-abc"] }),
        { status: 200 }
      ) as never
    );
    // check_batch_request_status returns not-finished
    vi.mocked(graphFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: "in_progress" }),
        { status: 200 }
      ) as never
    );

    const result = await reconcileStaleItems(
      DEALER_ID,
      CATALOG_ID,
      "automotive",
      new Set<string>(),
      TOKEN
    );

    expect(result.deleteAttempted).toBe(1);
    expect(result.deleteSucceeded).toBe(0);
    expect(result.deleteFailed).toBe(1);
    expect(prisma.metaCatalogSyncItem.updateMany).not.toHaveBeenCalled();
  });

  it("resolves handle via check_batch_request_status and marks confirmed deletions", async () => {
    vi.mocked(prisma.metaCatalogSyncItem.findMany).mockResolvedValue([
      { id: "sync-1", catalogItemId: "item-A" },
      { id: "sync-2", catalogItemId: "item-B" },
    ] as never);

    // items_batch returns handle
    vi.mocked(graphFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ handles: ["handle-xyz"] }),
        { status: 200 }
      ) as never
    );
    // check_batch_request_status returns finished with item-B failed
    vi.mocked(graphFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "finished",
          errors: [{ retailer_id: "item-B", message: "Not found" }],
        }),
        { status: 200 }
      ) as never
    );

    const result = await reconcileStaleItems(
      DEALER_ID,
      CATALOG_ID,
      "automotive",
      new Set<string>(),
      TOKEN
    );

    expect(result.deleteAttempted).toBe(2);
    expect(result.deleteSucceeded).toBe(1);
    expect(result.deleteFailed).toBe(1);

    // Only sync-1 (item-A) should be marked deleted
    expect(prisma.metaCatalogSyncItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["sync-1"] } },
      data: { lastDeletedAt: expect.any(Date) },
    });
  });

  it("does not mark lastDeletedAt when handles AND validation_status are both present but handle not finished", async () => {
    vi.mocked(prisma.metaCatalogSyncItem.findMany).mockResolvedValue([
      { id: "sync-1", catalogItemId: "item-A" },
      { id: "sync-2", catalogItemId: "item-B" },
    ] as never);

    // Response with both handles and validation_status — handles take precedence
    vi.mocked(graphFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          handles: ["handle-both"],
          validation_status: { errors: [] },
        }),
        { status: 200 }
      ) as never
    );
    // check_batch_request_status fails
    vi.mocked(graphFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "not ready" }), { status: 500 }) as never
    );

    const result = await reconcileStaleItems(
      DEALER_ID,
      CATALOG_ID,
      "automotive",
      new Set<string>(),
      TOKEN
    );

    expect(result.deleteAttempted).toBe(2);
    expect(result.deleteSucceeded).toBe(0);
    expect(result.deleteFailed).toBe(2);
    expect(prisma.metaCatalogSyncItem.updateMany).not.toHaveBeenCalled();
  });

  it("supports array-form validation_status with mixed outcomes", async () => {
    vi.mocked(prisma.metaCatalogSyncItem.findMany).mockResolvedValue([
      { id: "sync-1", catalogItemId: "item-A" },
      { id: "sync-2", catalogItemId: "item-B" },
      { id: "sync-3", catalogItemId: "item-C" },
    ] as never);

    // Array-form validation_status: item-B failed, one unmappable error entry
    vi.mocked(graphFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          validation_status: [
            { retailer_id: "item-B", message: "Invalid item" },
            { message: "Unknown error without item ID" },
          ],
        }),
        { status: 200 }
      ) as never
    );

    const result = await reconcileStaleItems(
      DEALER_ID,
      CATALOG_ID,
      "automotive",
      new Set<string>(),
      TOKEN
    );

    expect(result.deleteAttempted).toBe(3);
    // item-B explicitly failed, one unmapped error pulled back from succeeded
    expect(result.deleteFailed).toBe(2);
    expect(result.deleteSucceeded).toBe(1);

    // Only 1 item should be marked deleted (item-A or item-C, but not both
    // since one was demoted due to unmapped error)
    expect(prisma.metaCatalogSyncItem.updateMany).toHaveBeenCalledTimes(1);
    const updateCall = vi.mocked(prisma.metaCatalogSyncItem.updateMany).mock.calls[0][0];
    expect((updateCall.where as { id: { in: string[] } }).id.in).toHaveLength(1);
  });

  it("treats unresolved handle completion as failed — no premature lastDeletedAt", async () => {
    vi.mocked(prisma.metaCatalogSyncItem.findMany).mockResolvedValue([
      { id: "sync-1", catalogItemId: "item-A" },
      { id: "sync-2", catalogItemId: "item-B" },
    ] as never);

    // items_batch returns handle
    vi.mocked(graphFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ handles: ["handle-unresolved"] }),
        { status: 200 }
      ) as never
    );
    // check_batch_request_status throws network error
    vi.mocked(graphFetch).mockRejectedValueOnce(new Error("connection reset"));

    const result = await reconcileStaleItems(
      DEALER_ID,
      CATALOG_ID,
      "automotive",
      new Set<string>(),
      TOKEN
    );

    expect(result.deleteAttempted).toBe(2);
    expect(result.deleteSucceeded).toBe(0);
    expect(result.deleteFailed).toBe(2);
    expect(prisma.metaCatalogSyncItem.updateMany).not.toHaveBeenCalled();
  });
});

describe("deliverFeed empty-inventory reconciliation", () => {
  it("runs stale reconciliation when inventory is empty but tracked rows exist", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(API_DEALER as never);
    // No active vehicles
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([] as never);
    // Tracked items exist
    vi.mocked(prisma.metaCatalogSyncItem.count).mockResolvedValue(2 as never);
    // Return stale items for reconciliation
    vi.mocked(prisma.metaCatalogSyncItem.findMany).mockResolvedValue([
      { id: "sync-1", catalogItemId: "old-item-A" },
      { id: "sync-2", catalogItemId: "old-item-B" },
    ] as never);

    // Delete batch succeeds with clean response
    vi.mocked(graphFetch).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }) as never
    );

    const result = await deliverFeed(DEALER_ID);

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("unexpected");

    expect(result.summary.deleteAttempted).toBe(2);
    expect(result.summary.deleteSucceeded).toBe(2);
    expect(result.summary.deleteFailed).toBe(0);

    // Verify DELETE requests were sent to Meta
    expect(graphFetch).toHaveBeenCalledTimes(1);
    const [endpoint, opts] = vi.mocked(graphFetch).mock.calls[0];
    expect(endpoint).toBe(`/${CATALOG_ID}/items_batch`);
    const body = JSON.parse(opts.body as string);
    expect(body.requests).toEqual([
      { method: "DELETE", data: { id: "old-item-A" } },
      { method: "DELETE", data: { id: "old-item-B" } },
    ]);

    // Verify sync rows were marked deleted
    expect(prisma.metaCatalogSyncItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["sync-1", "sync-2"] } },
      data: { lastDeletedAt: expect.any(Date) },
    });
  });

  it("still returns no_pushable_inventory when zero tracked rows and zero inventory", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(API_DEALER as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.metaCatalogSyncItem.count).mockResolvedValue(0 as never);

    const result = await deliverFeed(DEALER_ID);

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("unexpected");
    expect(result.error).toBe("no_pushable_inventory");
    expect(graphFetch).not.toHaveBeenCalled();
  });
});

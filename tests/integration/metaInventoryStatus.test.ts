import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/meta", () => ({
  authGuard: vi.fn(),
  loadDealerToken: vi.fn(),
  graphFetch: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealer: { findUnique: vi.fn() },
    vehicle: { findMany: vi.fn() },
    listing: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/metaDelivery", () => ({
  isAutomotivePushable: vi.fn(),
  isServicesPushable: vi.fn(),
}));

import { authGuard, loadDealerToken, graphFetch } from "@/lib/meta";
import { prisma } from "@/lib/prisma";
import { isAutomotivePushable, isServicesPushable } from "@/lib/metaDelivery";
import { GET } from "@/app/api/meta/inventory/status/route";

const DEALER_ID = "dealer-status-001";
const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PAST_DATE = new Date(Date.now() - 1000);

const READY_DEALER = {
  metaDeliveryMethod: "api",
  metaCatalogId: "cat-123",
  metaAccessToken: "encrypted-token",
  metaTokenExpiresAt: FUTURE_DATE,
  vertical: "automotive",
  slug: "test-dealer",
};

function makeRequest(searchParams = "") {
  const url = `http://localhost:3000/api/meta/inventory/status${searchParams}`;
  return new Request(url, { method: "GET" }) as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authGuard).mockResolvedValue({ ok: true, dealerId: DEALER_ID });
  vi.mocked(loadDealerToken).mockResolvedValue("decrypted-token");
  vi.mocked(prisma.dealer.findUnique).mockResolvedValue(READY_DEALER as never);
  vi.mocked(prisma.vehicle.findMany).mockResolvedValue([{ imageUrl: "img.jpg", images: [], url: "https://example.com/car" }] as never);
  vi.mocked(prisma.listing.findMany).mockResolvedValue([] as never);
  vi.mocked(isAutomotivePushable).mockReturnValue(true);
  vi.mocked(isServicesPushable).mockReturnValue(false);
});

describe("GET /api/meta/inventory/status", () => {
  it("returns 401 when authGuard fails", async () => {
    vi.mocked(authGuard).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(prisma.dealer.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when dealer is not found", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("dealer_not_found");
  });

  it("ready:false when token is missing", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      ...READY_DEALER,
      metaAccessToken: null,
    } as never);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.ready).toBe(false);
    expect(body.readiness.tokenPresent).toBe(false);
    expect(body.readiness.tokenValid).toBe(false);
  });

  it("ready:false when token is expired", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      ...READY_DEALER,
      metaTokenExpiresAt: PAST_DATE,
    } as never);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.ready).toBe(false);
    expect(body.readiness.tokenValid).toBe(false);
  });

  it("ready:false when catalog not selected", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      ...READY_DEALER,
      metaCatalogId: null,
    } as never);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.ready).toBe(false);
    expect(body.readiness.catalogSelected).toBe(false);
  });

  it("ready:false when delivery mode is csv", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      ...READY_DEALER,
      metaDeliveryMethod: "csv",
    } as never);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.ready).toBe(false);
    expect(body.readiness.deliveryModeApi).toBe(false);
  });

  it("ready:false when vertical is unsupported", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      ...READY_DEALER,
      vertical: "realestate",
    } as never);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.ready).toBe(false);
    expect(body.readiness.supportedVertical).toBe(false);
  });

  it("ready:false when no pushable inventory", async () => {
    vi.mocked(isAutomotivePushable).mockReturnValue(false);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.ready).toBe(false);
    expect(body.readiness.hasInventory).toBe(false);
    expect(body.inventoryCount).toBe(0);
  });

  it("ready:true for fully-ready automotive dealer with pushable inventory", async () => {
    vi.mocked(isAutomotivePushable).mockReturnValue(true);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.ready).toBe(true);
    expect(body.inventoryCount).toBe(1);
    expect(body.vertical).toBe("automotive");
    expect(body.deliveryMethod).toBe("api");
  });

  it("ready:true for fully-ready services dealer with pushable listing", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      ...READY_DEALER,
      vertical: "services",
    } as never);
    vi.mocked(prisma.listing.findMany).mockResolvedValue([
      { imageUrls: ["https://cdn.example.com/image.jpg"] },
    ] as never);
    vi.mocked(isServicesPushable).mockReturnValue(true);
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.ready).toBe(true);
    expect(body.inventoryCount).toBe(1);
    expect(body.vertical).toBe("services");
  });

  it("calls graphFetch with handle and returns batchStatus on success", async () => {
    vi.mocked(isAutomotivePushable).mockReturnValue(true);
    vi.mocked(graphFetch).mockResolvedValue(
      new Response(JSON.stringify({ status: "complete", num_items: 5 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const res = await GET(makeRequest("?handle=abc123"));
    const body = await res.json();
    expect(graphFetch).toHaveBeenCalledTimes(1);
    const fetchCall = vi.mocked(graphFetch).mock.calls[0];
    expect(fetchCall[0]).toContain("check_batch_request_status");
    expect(fetchCall[0]).toContain("abc123");
    expect(body.batchStatus).toBeDefined();
    expect(body.batchStatus.status).toBe("complete");
  });

  it("returns batchStatus with error when graphFetch returns non-OK", async () => {
    vi.mocked(isAutomotivePushable).mockReturnValue(true);
    vi.mocked(graphFetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "invalid handle" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      })
    );
    const res = await GET(makeRequest("?handle=bad-handle"));
    const body = await res.json();
    expect(body.batchStatus).toBeDefined();
    expect(body.batchStatus.error).toBeDefined();
  });

  it("returns batchStatus with error when graphFetch throws", async () => {
    vi.mocked(isAutomotivePushable).mockReturnValue(true);
    vi.mocked(graphFetch).mockRejectedValue(new Error("network failure"));
    const res = await GET(makeRequest("?handle=abc123"));
    const body = await res.json();
    expect(body.batchStatus).toBeDefined();
    expect(body.batchStatus.error).toContain("network failure");
  });
});

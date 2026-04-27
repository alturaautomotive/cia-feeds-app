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
    metaDeliveryJob: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/metaDelivery", () => ({
  isAutomotivePushable: vi.fn(),
  isServicesPushable: vi.fn(),
  sanitizeErrorText: vi.fn((text: string) => text),
}));

import { authGuard, loadDealerToken, graphFetch } from "@/lib/meta";
import { prisma } from "@/lib/prisma";
import { isAutomotivePushable, isServicesPushable, sanitizeErrorText } from "@/lib/metaDelivery";
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
  // Default: all three findFirst calls (queue, lastRun, circuit) return null.
  // Tests that need specific queue/lastRun/circuit data must reset and re-seed.
  vi.mocked(prisma.metaDeliveryJob.findFirst).mockResolvedValue(null as never);
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

  // Queue state and last-run health tests
  it("includes queue state when a delivery job exists", async () => {
    vi.mocked(prisma.metaDeliveryJob.findFirst).mockReset();
    // queue findFirst — active job
    vi.mocked(prisma.metaDeliveryJob.findFirst).mockResolvedValueOnce({
      id: "job-001",
      status: "queued",
      nextRunAt: new Date("2026-04-26T12:00:00Z"),
      attemptCount: 0,
      coalescedCount: 2,
    } as never);
    // lastRun findFirst — no completed job
    vi.mocked(prisma.metaDeliveryJob.findFirst).mockResolvedValueOnce(null as never);
    // circuit findFirst — not blocked
    vi.mocked(prisma.metaDeliveryJob.findFirst).mockResolvedValueOnce(null as never);

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.queue).toBeDefined();
    expect(body.queue.jobId).toBe("job-001");
    expect(body.queue.status).toBe("queued");
    expect(body.queue.coalescedCount).toBe(2);
    expect(body.lastRun).toBeNull();
    expect(body.circuit.blocked).toBe(false);
  });

  it("includes last-run health when job has run", async () => {
    vi.mocked(prisma.metaDeliveryJob.findFirst).mockReset();
    // queue findFirst — no active job
    vi.mocked(prisma.metaDeliveryJob.findFirst).mockResolvedValueOnce(null as never);
    // lastRun findFirst — completed job with stats
    vi.mocked(prisma.metaDeliveryJob.findFirst).mockResolvedValueOnce({
      lastRunAt: new Date("2026-04-26T11:55:00Z"),
      lastRunStatus: "success",
      lastErrorCode: null,
      lastErrorMessage: null,
      lastItemsAttempted: 50,
      lastItemsSucceeded: 48,
      lastItemsFailed: 2,
      lastDeleteAttempted: 3,
      lastDeleteSucceeded: 3,
      lastDeleteFailed: 0,
    } as never);
    // circuit findFirst — not blocked
    vi.mocked(prisma.metaDeliveryJob.findFirst).mockResolvedValueOnce(null as never);

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.lastRun).toBeDefined();
    expect(body.lastRun.lastRunStatus).toBe("success");
    expect(body.lastRun.itemsAttempted).toBe(50);
    expect(body.lastRun.itemsSucceeded).toBe(48);
    expect(body.lastRun.deleteSucceeded).toBe(3);
  });

  it("includes circuit breaker info when dealer is blocked", async () => {
    vi.mocked(prisma.metaDeliveryJob.findFirst).mockReset();
    // queue findFirst — no active job
    vi.mocked(prisma.metaDeliveryJob.findFirst).mockResolvedValueOnce(null as never);
    // lastRun findFirst — last run had error
    vi.mocked(prisma.metaDeliveryJob.findFirst).mockResolvedValueOnce({
      lastRunAt: new Date("2026-04-26T11:50:00Z"),
      lastRunStatus: "error",
      lastErrorCode: "Auth/permission failure",
      lastErrorMessage: "Token expired",
      lastItemsAttempted: 0,
      lastItemsSucceeded: 0,
      lastItemsFailed: 0,
      lastDeleteAttempted: 0,
      lastDeleteSucceeded: 0,
      lastDeleteFailed: 0,
    } as never);
    // circuit findFirst — blocked job
    vi.mocked(prisma.metaDeliveryJob.findFirst).mockResolvedValueOnce({
      blockedAt: new Date("2026-04-26T11:50:00Z"),
      blockedReason: "auth_failure: token expired",
      consecutiveAuthFailures: 3,
    } as never);

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.circuit.blocked).toBe(true);
    expect(body.circuit.needsReconnect).toBe(true);
    expect(body.circuit.reason).toContain("auth_failure");
    expect(body.circuit.consecutiveAuthFailures).toBe(3);
    // blocked dealer should not be ready
    expect(body.ready).toBe(false);
    expect(body.readiness.notBlocked).toBe(false);
  });

  it("returns null queue when no delivery jobs exist", async () => {
    // All three findFirst calls return null (already set in beforeEach via mockResolvedValueOnce)
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.queue).toBeNull();
    expect(body.lastRun).toBeNull();
    expect(body.circuit.blocked).toBe(false);
    expect(body.circuit.needsReconnect).toBe(false);
  });
});

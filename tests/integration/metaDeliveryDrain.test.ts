import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealer: { findUnique: vi.fn() },
    metaDeliveryJob: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    metaCatalogSyncItem: {
      count: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    vehicle: { findMany: vi.fn() },
    listing: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/meta", () => ({
  loadDealerToken: vi.fn(),
  graphFetch: vi.fn(),
}));

vi.mock("@/lib/csv", () => ({
  mapVehicleToRow: vi.fn((v: Record<string, unknown>) => v),
  serializeServicesRow: vi.fn((l: Record<string, unknown>) => l),
}));

import { prisma } from "@/lib/prisma";
import { loadDealerToken, graphFetch } from "@/lib/meta";
import { drainDeliveryQueue, claimDueJobs } from "@/lib/metaDelivery";

const DEALER_ID = "dealer-drain-001";

beforeEach(() => {
  vi.clearAllMocks();
});

// Helper to set up claim mocks that return specific jobs
function mockClaimJobs(jobs: { id: string; dealerId: string }[]) {
  // Recovery updateMany
  vi.mocked(prisma.metaDeliveryJob.updateMany).mockResolvedValueOnce({ count: 0 } as never);
  // findMany returns the jobs
  vi.mocked(prisma.metaDeliveryJob.findMany).mockResolvedValueOnce(jobs as never);
  // Each job claim succeeds
  for (const _job of jobs) {
    vi.mocked(prisma.metaDeliveryJob.updateMany).mockResolvedValueOnce({ count: 1 } as never);
  }
}

describe("drainDeliveryQueue - concurrent claim protection", () => {
  it("does not process a job when claim returns count 0", async () => {
    // Recovery step
    vi.mocked(prisma.metaDeliveryJob.updateMany).mockResolvedValueOnce({ count: 0 } as never);
    // findMany returns a job
    vi.mocked(prisma.metaDeliveryJob.findMany).mockResolvedValueOnce([
      { id: "job-1", dealerId: DEALER_ID },
    ] as never);
    // Claim fails (another worker got it)
    vi.mocked(prisma.metaDeliveryJob.updateMany).mockResolvedValueOnce({ count: 0 } as never);

    const summary = await drainDeliveryQueue();
    expect(summary.processed).toBe(0);
    expect(summary.succeeded).toBe(0);
    // No dealer lookup should have happened
    expect(prisma.dealer.findUnique).not.toHaveBeenCalled();
  });

  it("only processes one job per dealer even with multiple queued", async () => {
    // Recovery step
    vi.mocked(prisma.metaDeliveryJob.updateMany).mockResolvedValueOnce({ count: 0 } as never);
    // Two jobs for same dealer
    vi.mocked(prisma.metaDeliveryJob.findMany).mockResolvedValueOnce([
      { id: "job-1", dealerId: DEALER_ID },
      { id: "job-2", dealerId: DEALER_ID },
    ] as never);
    // Only first claim attempted
    vi.mocked(prisma.metaDeliveryJob.updateMany).mockResolvedValueOnce({ count: 1 } as never);

    // Set up dealer + delivery mocks for the one job that processes
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      metaDeliveryMethod: "api",
      metaCatalogId: "cat-1",
      metaAccessToken: "enc-tok",
      vertical: "automotive",
      slug: "test",
      feedUrlMode: "original",
      address: null,
      metaTokenExpiresAt: null,
    } as never);
    vi.mocked(loadDealerToken).mockResolvedValue("tok-plain");
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([]);
    vi.mocked(prisma.metaCatalogSyncItem.count).mockResolvedValue(0);
    // leaseGuardedUpdate uses updateMany for state transitions
    vi.mocked(prisma.metaDeliveryJob.updateMany).mockResolvedValue({ count: 1 } as never);

    const summary = await drainDeliveryQueue();
    // Only 1 job claimed (second skipped for same dealer)
    expect(summary.processed).toBe(1);
  });
});

describe("drainDeliveryQueue - retry scheduling and attempt caps", () => {
  it("schedules retry with backoff on transient error within attempt limit", async () => {
    mockClaimJobs([{ id: "job-retry", dealerId: DEALER_ID }]);

    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      metaDeliveryMethod: "api",
      metaCatalogId: "cat-1",
      metaAccessToken: "enc-tok",
      vertical: "automotive",
      slug: "test",
      feedUrlMode: "original",
      address: null,
      metaTokenExpiresAt: null,
    } as never);
    vi.mocked(loadDealerToken).mockResolvedValue("tok-plain");
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      { id: "v1", dealerId: DEALER_ID, url: "http://x.com", imageUrl: "http://img.jpg", archivedAt: null } as never,
    ]);
    vi.mocked(prisma.metaCatalogSyncItem.count).mockResolvedValue(0);

    // Graph fetch returns a server error (transient)
    vi.mocked(graphFetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "Internal Server Error" } }),
    } as never);

    // Current job state via findFirst (lease-guarded read)
    vi.mocked(prisma.metaDeliveryJob.findFirst).mockResolvedValueOnce({
      attemptCount: 1,
      maxAttempts: 5,
      consecutiveAuthFailures: 0,
    } as never);
    // leaseGuardedUpdate uses updateMany for state transitions
    vi.mocked(prisma.metaDeliveryJob.updateMany).mockResolvedValue({ count: 1 } as never);

    const summary = await drainDeliveryQueue();
    expect(summary.retried).toBe(1);

    // Verify updateMany was called with retry status and future nextRunAt
    // Find the leaseGuardedUpdate call (after the claim calls)
    const updateManyCalls = vi.mocked(prisma.metaDeliveryJob.updateMany).mock.calls;
    const retryCall = updateManyCalls.find(
      (call) => (call[0].data as Record<string, unknown>)?.status === "retry"
    );
    expect(retryCall).toBeDefined();
    expect(retryCall![0].data).toMatchObject({
      status: "retry",
      attemptCount: 2,
    });
    expect(((retryCall![0].data as Record<string, unknown>).nextRunAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("marks job as failed when attempt count reaches maxAttempts", async () => {
    mockClaimJobs([{ id: "job-max", dealerId: DEALER_ID }]);

    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      metaDeliveryMethod: "api",
      metaCatalogId: "cat-1",
      metaAccessToken: "enc-tok",
      vertical: "automotive",
      slug: "test",
      feedUrlMode: "original",
      address: null,
      metaTokenExpiresAt: null,
    } as never);
    vi.mocked(loadDealerToken).mockResolvedValue("tok-plain");
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      { id: "v1", dealerId: DEALER_ID, url: "http://x.com", imageUrl: "http://img.jpg", archivedAt: null } as never,
    ]);
    vi.mocked(prisma.metaCatalogSyncItem.count).mockResolvedValue(0);

    vi.mocked(graphFetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "Server Error" } }),
    } as never);

    // At max attempts already — findFirst (lease-guarded read)
    vi.mocked(prisma.metaDeliveryJob.findFirst).mockResolvedValueOnce({
      attemptCount: 4,
      maxAttempts: 5,
      consecutiveAuthFailures: 0,
    } as never);
    // leaseGuardedUpdate uses updateMany
    vi.mocked(prisma.metaDeliveryJob.updateMany).mockResolvedValue({ count: 1 } as never);

    const summary = await drainDeliveryQueue();
    expect(summary.errors).toBe(1);

    const updateManyCalls = vi.mocked(prisma.metaDeliveryJob.updateMany).mock.calls;
    const failedCall = updateManyCalls.find(
      (call) => (call[0].data as Record<string, unknown>)?.status === "failed"
    );
    expect(failedCall).toBeDefined();
    expect(failedCall![0].data).toMatchObject({
      status: "failed",
      attemptCount: 5,
    });
  });
});

describe("drainDeliveryQueue - auth failure circuit breaker", () => {
  it("blocks job after consecutive auth failures reach threshold", async () => {
    mockClaimJobs([{ id: "job-auth", dealerId: DEALER_ID }]);

    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      metaDeliveryMethod: "api",
      metaCatalogId: "cat-1",
      metaAccessToken: "enc-tok",
      vertical: "automotive",
      slug: "test",
      feedUrlMode: "original",
      address: null,
      metaTokenExpiresAt: null,
    } as never);
    vi.mocked(loadDealerToken).mockResolvedValue("tok-plain");
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      { id: "v1", dealerId: DEALER_ID, url: "http://x.com", imageUrl: "http://img.jpg", archivedAt: null } as never,
    ]);
    vi.mocked(prisma.metaCatalogSyncItem.count).mockResolvedValue(0);

    // Auth failure response
    vi.mocked(graphFetch).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 190, message: "Invalid access token" } }),
    } as never);

    // Already at threshold - 1 auth failures — findFirst (lease-guarded read)
    vi.mocked(prisma.metaDeliveryJob.findFirst).mockResolvedValueOnce({
      attemptCount: 2,
      maxAttempts: 5,
      consecutiveAuthFailures: 2,
    } as never);
    // leaseGuardedUpdate uses updateMany
    vi.mocked(prisma.metaDeliveryJob.updateMany).mockResolvedValue({ count: 1 } as never);

    const summary = await drainDeliveryQueue();
    expect(summary.blocked).toBe(1);

    const updateManyCalls = vi.mocked(prisma.metaDeliveryJob.updateMany).mock.calls;
    const blockedCall = updateManyCalls.find(
      (call) => (call[0].data as Record<string, unknown>)?.status === "blocked"
    );
    expect(blockedCall).toBeDefined();
    expect(blockedCall![0].data).toMatchObject({
      status: "blocked",
      consecutiveAuthFailures: 3,
    });
    expect((blockedCall![0].data as { blockedReason: string }).blockedReason).toContain("auth_failure");
  });
});

describe("drainDeliveryQueue - CSV rollback skip", () => {
  it("skips job when dealer has been rolled back to CSV mode", async () => {
    mockClaimJobs([{ id: "job-csv", dealerId: DEALER_ID }]);

    // Dealer was switched to CSV after the job was queued
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      metaDeliveryMethod: "csv",
    } as never);
    // leaseGuardedUpdate uses updateMany
    vi.mocked(prisma.metaDeliveryJob.updateMany).mockResolvedValue({ count: 1 } as never);

    const summary = await drainDeliveryQueue();
    expect(summary.skipped).toBe(1);
    expect(summary.succeeded).toBe(0);

    const updateManyCalls = vi.mocked(prisma.metaDeliveryJob.updateMany).mock.calls;
    const skipCall = updateManyCalls.find(
      (call) => (call[0].data as Record<string, unknown>)?.status === "skipped"
    );
    expect(skipCall).toBeDefined();
    expect(skipCall![0].data).toMatchObject({
      status: "skipped",
      lastRunStatus: "skipped",
      lastErrorCode: "dealer_mode_csv",
    });
  });

  it("skips job when dealer no longer exists", async () => {
    mockClaimJobs([{ id: "job-gone", dealerId: DEALER_ID }]);

    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(null);
    // leaseGuardedUpdate uses updateMany
    vi.mocked(prisma.metaDeliveryJob.updateMany).mockResolvedValue({ count: 1 } as never);

    const summary = await drainDeliveryQueue();
    expect(summary.skipped).toBe(1);

    const updateManyCalls = vi.mocked(prisma.metaDeliveryJob.updateMany).mock.calls;
    const skipCall = updateManyCalls.find(
      (call) => (call[0].data as Record<string, unknown>)?.status === "skipped"
    );
    expect(skipCall).toBeDefined();
    expect(skipCall![0].data).toMatchObject({
      status: "skipped",
      lastErrorCode: "dealer_not_found",
    });
  });
});

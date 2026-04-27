import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealer: { findUnique: vi.fn() },
    metaDeliveryJob: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/meta", () => ({
  loadDealerToken: vi.fn(),
  graphFetch: vi.fn(),
}));

vi.mock("@/lib/csv", () => ({
  mapVehicleToRow: vi.fn(),
  serializeServicesRow: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { enqueueDeliveryJob, claimDueJobs } from "@/lib/metaDelivery";

const DEALER_ID = "dealer-queue-001";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enqueueDeliveryJob", () => {
  it("returns skipped when dealer not found", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(null);
    const result = await enqueueDeliveryJob(DEALER_ID, "manual");
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toBe("dealer_not_found");
    }
  });

  it("returns skipped when dealer is CSV mode", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      metaDeliveryMethod: "csv",
    } as never);
    const result = await enqueueDeliveryJob(DEALER_ID, "manual");
    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toBe("dealer_mode_csv");
    }
  });

  it("returns blocked when dealer has a blocked job", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      metaDeliveryMethod: "api",
    } as never);
    vi.mocked(prisma.metaDeliveryJob.findFirst)
      .mockResolvedValueOnce({
        id: "blocked-job",
        status: "blocked",
        blockedReason: "auth_failure: token expired",
      } as never);
    const result = await enqueueDeliveryJob(DEALER_ID, "manual");
    expect(result.outcome).toBe("blocked");
    if (result.outcome === "blocked") {
      expect(result.reason).toContain("auth_failure");
    }
  });

  it("coalesces when an active job exists for the same dealer", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      metaDeliveryMethod: "api",
    } as never);
    // No blocked job
    vi.mocked(prisma.metaDeliveryJob.findFirst)
      .mockResolvedValueOnce(null)
      // Active job exists
      .mockResolvedValueOnce({
        id: "existing-job",
        status: "queued",
        coalescedCount: 1,
      } as never);
    vi.mocked(prisma.metaDeliveryJob.update).mockResolvedValue({
      id: "existing-job",
      coalescedCount: 2,
    } as never);

    const result = await enqueueDeliveryJob(DEALER_ID, "mutation");
    expect(result.outcome).toBe("coalesced");
    if (result.outcome === "coalesced") {
      expect(result.jobId).toBe("existing-job");
      expect(result.coalescedCount).toBe(2);
    }
  });

  it("creates a new queued job when no active job exists", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      metaDeliveryMethod: "api",
    } as never);
    // No blocked job
    vi.mocked(prisma.metaDeliveryJob.findFirst)
      .mockResolvedValueOnce(null)
      // No active job
      .mockResolvedValueOnce(null);
    vi.mocked(prisma.metaDeliveryJob.create).mockResolvedValue({
      id: "new-job-001",
      status: "queued",
    } as never);

    const result = await enqueueDeliveryJob(DEALER_ID, "api_push");
    expect(result.outcome).toBe("queued");
    if (result.outcome === "queued") {
      expect(result.jobId).toBe("new-job-001");
    }
    expect(prisma.metaDeliveryJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dealerId: DEALER_ID,
          trigger: "api_push",
          status: "queued",
        }),
      })
    );
  });
});

describe("claimDueJobs", () => {
  it("returns empty array when no due jobs", async () => {
    vi.mocked(prisma.metaDeliveryJob.findMany).mockResolvedValue([]);
    const claimed = await claimDueJobs(10);
    expect(claimed).toEqual([]);
  });

  it("claims due jobs and skips duplicate dealers", async () => {
    vi.mocked(prisma.metaDeliveryJob.findMany).mockResolvedValue([
      { id: "job-1", dealerId: "dealer-A" },
      { id: "job-2", dealerId: "dealer-A" }, // same dealer — should be skipped
      { id: "job-3", dealerId: "dealer-B" },
    ] as never);
    vi.mocked(prisma.metaDeliveryJob.updateMany).mockResolvedValue({ count: 1 } as never);

    const claimed = await claimDueJobs(10);
    // Should claim job-1 (dealer-A) and job-3 (dealer-B), skip job-2
    expect(claimed).toHaveLength(2);
    expect(claimed[0].dealerId).toBe("dealer-A");
    expect(claimed[1].dealerId).toBe("dealer-B");
    // 3 calls: 1 for lease recovery + 2 for claims
    expect(prisma.metaDeliveryJob.updateMany).toHaveBeenCalledTimes(3);
  });

  it("does not claim job when updateMany returns count 0 (lost race)", async () => {
    vi.mocked(prisma.metaDeliveryJob.findMany).mockResolvedValue([
      { id: "job-1", dealerId: "dealer-A" },
    ] as never);
    // First call is the lease recovery, second is the claim attempt that loses the race
    vi.mocked(prisma.metaDeliveryJob.updateMany)
      .mockResolvedValueOnce({ count: 0 } as never) // lease recovery
      .mockResolvedValueOnce({ count: 0 } as never); // claim fails

    const claimed = await claimDueJobs(10);
    expect(claimed).toHaveLength(0);
  });

  it("recovers expired processing jobs before claiming", async () => {
    vi.mocked(prisma.metaDeliveryJob.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.metaDeliveryJob.updateMany).mockResolvedValue({ count: 2 } as never);

    await claimDueJobs(10);
    // First updateMany call should be the recovery step
    expect(prisma.metaDeliveryJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "processing",
          leaseExpiresAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
        data: expect.objectContaining({
          status: "retry",
          leaseToken: null,
          leaseExpiresAt: null,
        }),
      })
    );
  });
});

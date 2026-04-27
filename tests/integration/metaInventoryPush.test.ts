import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/meta", () => ({
  authGuard: vi.fn(),
}));

vi.mock("@/lib/metaDelivery", () => ({
  enqueueDeliveryJob: vi.fn(),
}));

import { authGuard } from "@/lib/meta";
import { enqueueDeliveryJob } from "@/lib/metaDelivery";
import { POST } from "@/app/api/meta/inventory/push/route";

const DEALER_ID = "dealer-push-001";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authGuard).mockResolvedValue({ ok: true, dealerId: DEALER_ID });
});

describe("POST /api/meta/inventory/push", () => {
  it("returns 401 when authGuard fails", async () => {
    vi.mocked(authGuard).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    });
    const res = await POST();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(enqueueDeliveryJob).not.toHaveBeenCalled();
  });

  it("returns 200 with queued status when job is created", async () => {
    vi.mocked(enqueueDeliveryJob).mockResolvedValue({
      outcome: "queued",
      jobId: "job-001",
    });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("api");
    expect(body.status).toBe("queued");
    expect(body.summary).toEqual({ accepted: true, jobId: "job-001" });
    expect(body.queue.outcome).toBe("queued");
    expect(body.queue.jobId).toBe("job-001");
    expect(body.hint).toBeDefined();
    expect(enqueueDeliveryJob).toHaveBeenCalledWith(DEALER_ID, "api_push");
  });

  it("returns 200 with coalesced status when job already active", async () => {
    vi.mocked(enqueueDeliveryJob).mockResolvedValue({
      outcome: "coalesced",
      jobId: "job-002",
      coalescedCount: 3,
    });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("api");
    expect(body.status).toBe("queued");
    expect(body.summary).toEqual({ accepted: true, jobId: "job-002", coalescedCount: 3 });
    expect(body.queue.outcome).toBe("coalesced");
    expect(body.queue.jobId).toBe("job-002");
    expect(body.queue.coalescedCount).toBe(3);
    expect(body.hint).toBeDefined();
  });

  it("returns 422 with blocked status when dealer is blocked", async () => {
    vi.mocked(enqueueDeliveryJob).mockResolvedValue({
      outcome: "blocked",
      reason: "auth_failure: token expired",
    });
    const res = await POST();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.mode).toBe("api");
    expect(body.status).toBe("error");
    expect(body.error).toContain("auth_failure");
    expect(body.needsReconnect).toBe(true);
    expect(body.queue.outcome).toBe("blocked");
  });

  it("returns 200 with skipped status when dealer is CSV", async () => {
    vi.mocked(enqueueDeliveryJob).mockResolvedValue({
      outcome: "skipped",
      reason: "dealer_mode_csv",
    });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("csv");
    expect(body.status).toBe("skipped");
    expect(body.reason).toBe("dealer_mode_csv");
    expect(body.queue.outcome).toBe("skipped");
  });

  it("returns 200 with skipped status when dealer not found", async () => {
    vi.mocked(enqueueDeliveryJob).mockResolvedValue({
      outcome: "skipped",
      reason: "dealer_not_found",
    });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("api");
    expect(body.status).toBe("skipped");
    expect(body.reason).toBe("dealer_not_found");
    expect(body.queue.outcome).toBe("skipped");
  });
});

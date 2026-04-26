import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/meta", () => ({
  authGuard: vi.fn(),
}));

vi.mock("@/lib/metaDelivery", () => ({
  deliverFeed: vi.fn(),
}));

import { authGuard } from "@/lib/meta";
import { deliverFeed } from "@/lib/metaDelivery";
import { POST } from "@/app/api/meta/inventory/push/route";

const DEALER_ID = "dealer-push-001";

const PARTIAL_SUMMARY = {
  batches: 1,
  itemsAttempted: 10,
  itemsSucceeded: 8,
  itemsFailed: 2,
  handles: [],
  warnings: [],
  errors: ["some item error"],
  deleteAttempted: 0,
  deleteSucceeded: 0,
  deleteFailed: 0,
};

const SUCCESS_SUMMARY = {
  batches: 1,
  itemsAttempted: 5,
  itemsSucceeded: 5,
  itemsFailed: 0,
  handles: [],
  warnings: [],
  errors: [],
  deleteAttempted: 0,
  deleteSucceeded: 0,
  deleteFailed: 0,
};

function makeRequest() {
  return new Request("http://localhost:3000/api/meta/inventory/push", {
    method: "POST",
  }) as Parameters<typeof POST>[0];
}

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
    expect(deliverFeed).not.toHaveBeenCalled();
  });

  it("returns 200 with skipped body when dealer is on CSV mode", async () => {
    vi.mocked(deliverFeed).mockResolvedValue({
      mode: "csv",
      status: "skipped",
      reason: "Dealer delivery method is CSV; inventory push skipped.",
    });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("skipped");
    expect(body.mode).toBe("csv");
    expect(body.reason).toBeDefined();
  });

  it("returns 422 with error body when deliverFeed returns an error without partialSummary", async () => {
    vi.mocked(deliverFeed).mockResolvedValue({
      mode: "api",
      status: "error",
      error: "meta_catalog_not_selected",
    });
    const res = await POST();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.error).toBe("meta_catalog_not_selected");
    expect(body.summary).toBeUndefined();
  });

  it("returns 422 with summary field when deliverFeed returns an error with partialSummary", async () => {
    vi.mocked(deliverFeed).mockResolvedValue({
      mode: "api",
      status: "error",
      error: "all_batches_failed",
      partialSummary: PARTIAL_SUMMARY,
    });
    const res = await POST();
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.summary).toBeDefined();
    expect(body.summary.batches).toBe(1);
  });

  it("returns 200 success with no hint when handles is empty", async () => {
    vi.mocked(deliverFeed).mockResolvedValue({
      mode: "api",
      status: "success",
      summary: { ...SUCCESS_SUMMARY, handles: [] },
    });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.mode).toBe("api");
    expect(body.summary).toBeDefined();
    expect(body.hint).toBeUndefined();
  });

  it("returns 200 success with hint when handles is non-empty", async () => {
    vi.mocked(deliverFeed).mockResolvedValue({
      mode: "api",
      status: "success",
      summary: { ...SUCCESS_SUMMARY, handles: ["handle-abc123"] },
    });
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(typeof body.hint).toBe("string");
    expect(body.hint.length).toBeGreaterThan(0);
  });
});

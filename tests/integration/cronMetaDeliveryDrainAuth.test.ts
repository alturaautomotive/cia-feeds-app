import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.CRON_SECRET = "test-cron-secret";
});

vi.mock("@/lib/metaDelivery", () => ({
  drainDeliveryQueue: vi.fn(),
}));

import { drainDeliveryQueue } from "@/lib/metaDelivery";
import { GET } from "@/app/api/cron/meta-delivery-drain/route";

const CRON_SECRET = "test-cron-secret";

function makeRequest(auth?: string) {
  return new Request("http://localhost:3000/api/cron/meta-delivery-drain", {
    method: "GET",
    headers: auth ? { authorization: auth } : {},
  }) as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
  vi.mocked(drainDeliveryQueue).mockResolvedValue({
    processed: 0,
    succeeded: 0,
    retried: 0,
    blocked: 0,
    skipped: 0,
    errors: 0,
  });
});

describe("GET /api/cron/meta-delivery-drain — authorization", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(drainDeliveryQueue).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header has wrong secret", async () => {
    const res = await GET(makeRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(drainDeliveryQueue).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET env var is not set", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(drainDeliveryQueue).not.toHaveBeenCalled();
  });

  it("proceeds with valid secret and returns drain summary", async () => {
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.summary).toEqual({
      processed: 0,
      succeeded: 0,
      retried: 0,
      blocked: 0,
      skipped: 0,
      errors: 0,
    });
    expect(drainDeliveryQueue).toHaveBeenCalledTimes(1);
  });
});

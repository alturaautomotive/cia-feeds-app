import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vehicle: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock metaDelivery
vi.mock("@/lib/metaDelivery", () => ({
  dispatchFeedDeliveryInBackground: vi.fn(),
}));

// Stub global fetch for URL health checks
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { prisma } from "@/lib/prisma";
import { dispatchFeedDeliveryInBackground } from "@/lib/metaDelivery";
import { GET } from "@/app/api/cron/url-health/route";

const CRON_SECRET = "test-cron-secret";

function makeRequest(auth?: string) {
  return new Request("http://localhost:3000/api/cron/url-health", {
    method: "GET",
    headers: auth ? { authorization: auth } : {},
  }) as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
  vi.mocked(prisma.vehicle.update).mockResolvedValue({} as never);
});

describe("GET /api/cron/url-health — dispatch", () => {
  it("dispatches once per changed dealer even with multiple archived vehicles", async () => {
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      { id: "v1", url: "https://example.com/v1", dealerId: "dealer-A" },
      { id: "v2", url: "https://example.com/v2", dealerId: "dealer-A" },
      { id: "v3", url: "https://example.com/v3", dealerId: "dealer-B" },
    ] as never);

    // All return 404 (sold_or_removed)
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();

    expect(body.archived).toBe(3);

    // Should dispatch once per dealer, not per vehicle
    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledTimes(2);

    const calledDealerIds = vi.mocked(dispatchFeedDeliveryInBackground).mock.calls.map(
      (c) => c[0]
    );
    expect(calledDealerIds.sort()).toEqual(["dealer-A", "dealer-B"]);
  });

  it("does not dispatch when no vehicles are archived", async () => {
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      { id: "v1", url: "https://example.com/v1", dealerId: "dealer-A" },
    ] as never);

    // Return 200 (active)
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();

    expect(body.archived).toBe(0);
    expect(dispatchFeedDeliveryInBackground).not.toHaveBeenCalled();
  });

  it("does not dispatch on unauthorized request", async () => {
    const res = await GET(makeRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);

    expect(dispatchFeedDeliveryInBackground).not.toHaveBeenCalled();
  });

  it("dispatches for redirect archival too", async () => {
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      { id: "v1", url: "https://example.com/v1", dealerId: "dealer-C" },
    ] as never);

    // Return 301 with non-VDP redirect
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 301,
        headers: { location: "https://example.com/homepage" },
      })
    );

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();

    expect(body.archived).toBe(1);
    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledTimes(1);
    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledWith(
      "dealer-C",
      "cron/url-health/GET",
      expect.any(Function)
    );
  });
});

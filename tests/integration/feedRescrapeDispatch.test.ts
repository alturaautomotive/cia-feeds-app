import { describe, it, expect, vi, beforeEach } from "vitest";

// Set ADMIN_EMAIL before any module loads — vi.hoisted runs before vi.mock factories
vi.hoisted(() => {
  process.env.ADMIN_EMAIL = "admin@test.com";
});

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealer: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    vehicle: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock next-auth session
vi.mock("next-auth", () => ({
  default: vi.fn(),
  getServerSession: vi.fn().mockResolvedValue({
    user: { email: "admin@test.com" },
  }),
}));

// Mock auth options
vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

// Mock scrape module
vi.mock("@/lib/scrape", () => ({
  scrapeVehicleUrl: vi.fn(),
}));

// Track dispatch calls directly — rescrapeInBackground calls dispatch
// with its own immediateExec wrapper so we just need to verify call count
vi.mock("@/lib/metaDelivery", () => ({
  dispatchFeedDeliveryInBackground: vi.fn(),
}));

// Mock after() to capture and allow synchronous execution in tests
const afterCallbacks: (() => Promise<void>)[] = [];
vi.mock("next/server", () => ({
  NextRequest: class NextRequest extends Request {},
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
    }),
  },
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb);
  },
}));

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { scrapeVehicleUrl } from "@/lib/scrape";
import { dispatchFeedDeliveryInBackground } from "@/lib/metaDelivery";
import { POST } from "@/app/api/admin/feed-rescrape/route";

const ADMIN_EMAIL = "admin@test.com";

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/admin/feed-rescrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
}

function makeScrapeResult(vehicleId: string, dealerId: string) {
  return {
    vehicle: {
      id: vehicleId,
      dealerId,
      url: "https://example.com/car",
      vin: "1HGBH41JXMN109186",
      make: "Honda",
      model: "Civic",
      year: "2022",
      bodyStyle: null,
      price: 24500,
      mileageValue: 18200,
      stateOfVehicle: "Used",
      exteriorColor: "White",
      imageUrl: "https://example.com/img.jpg",
      description: "Test vehicle",
      address: null,
      latitude: null,
      longitude: null,
      isComplete: true,
      missingFields: [],
    },
    url: "https://example.com/car",
    fieldsExtracted: ["make", "model"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;

  vi.mocked(getServerSession).mockResolvedValue({
    user: { email: ADMIN_EMAIL },
  } as never);
  vi.mocked(prisma.dealer.findUnique).mockResolvedValue({ id: "dealer-A" } as never);
  vi.mocked(prisma.vehicle.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.vehicle.updateMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(prisma.vehicle.update).mockResolvedValue({} as never);
  vi.mocked(dispatchFeedDeliveryInBackground).mockImplementation(() => {});
});

describe("POST /api/admin/feed-rescrape — dispatch", () => {
  it("dispatches once per dealer after successful rescrape of multiple vehicles", async () => {
    const vehicles = [
      { id: "v1", url: "https://example.com/v1", dealerId: "dealer-A" },
      { id: "v2", url: "https://example.com/v2", dealerId: "dealer-A" },
      { id: "v3", url: "https://example.com/v3", dealerId: "dealer-B" },
    ];
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue(vehicles as never);

    vi.mocked(scrapeVehicleUrl).mockImplementation((_url, dealerId) =>
      Promise.resolve(makeScrapeResult("v-x", dealerId!) as never)
    );

    const res = await POST(makeRequest({ dealerId: "dealer-A" }));
    expect(res.status).toBe(200);

    // Execute after() callbacks (rescrapeInBackground)
    for (const cb of afterCallbacks) {
      await cb();
    }

    // Should dispatch once per unique dealer
    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledTimes(2);

    const calledDealerIds = vi.mocked(dispatchFeedDeliveryInBackground).mock.calls.map(
      (c) => c[0]
    );
    expect(calledDealerIds.sort()).toEqual(["dealer-A", "dealer-B"]);

    // Trigger label should match
    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledWith(
      expect.any(String),
      "admin/feed-rescrape/POST",
      expect.any(Function)
    );
  });

  it("does not dispatch when all scrapes fail", async () => {
    const vehicles = [
      { id: "v1", url: "https://example.com/v1", dealerId: "dealer-A" },
    ];
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue(vehicles as never);
    vi.mocked(scrapeVehicleUrl).mockRejectedValue(new Error("scrape failed"));

    const res = await POST(makeRequest({ dealerId: "dealer-A" }));
    expect(res.status).toBe(200);

    for (const cb of afterCallbacks) {
      await cb();
    }

    expect(dispatchFeedDeliveryInBackground).not.toHaveBeenCalled();
  });

  it("does not dispatch on forbidden request", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "notadmin@test.com" },
    } as never);

    const res = await POST(makeRequest({ dealerId: "dealer-A" }));
    expect(res.status).toBe(403);

    expect(dispatchFeedDeliveryInBackground).not.toHaveBeenCalled();
  });

  it("dispatches only for dealers with at least one successful update", async () => {
    const vehicles = [
      { id: "v1", url: "https://example.com/v1", dealerId: "dealer-A" },
      { id: "v2", url: "https://example.com/v2", dealerId: "dealer-B" },
    ];
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue(vehicles as never);

    // dealer-A succeeds, dealer-B fails
    vi.mocked(scrapeVehicleUrl).mockImplementation((url) => {
      if (url.includes("v1")) return Promise.resolve(makeScrapeResult("v1", "dealer-A") as never);
      return Promise.reject(new Error("scrape failed"));
    });

    const res = await POST(makeRequest({ dealerId: "dealer-A" }));
    expect(res.status).toBe(200);

    for (const cb of afterCallbacks) {
      await cb();
    }

    // Only dealer-A should get dispatch
    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledTimes(1);
    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledWith(
      "dealer-A",
      "admin/feed-rescrape/POST",
      expect.any(Function)
    );
  });
});

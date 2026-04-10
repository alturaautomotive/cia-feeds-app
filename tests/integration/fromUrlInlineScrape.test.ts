import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vehicle: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    crawlSnapshot: {
      updateMany: vi.fn(),
    },
  },
}));

// Mock next-auth session
vi.mock("next-auth", () => ({
  default: vi.fn(),
  getServerSession: vi.fn().mockResolvedValue({
    user: { id: "user-001", name: "Test Dealer", email: "test@test.com" },
  }),
}));

// Mock impersonation to return a fixed dealerId
vi.mock("@/lib/impersonation", () => ({
  getEffectiveDealerId: vi.fn().mockResolvedValue("dealer-001"),
}));

// Mock checkSubscription to allow requests
vi.mock("@/lib/checkSubscription", () => ({
  checkSubscription: vi.fn().mockResolvedValue(true),
}));

// Mock rateLimit to allow requests
vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }),
}));

// Mock scrape module
vi.mock("@/lib/scrape", () => ({
  scrapeVehicleUrl: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { scrapeVehicleUrl } from "@/lib/scrape";
import { POST } from "@/app/api/vehicles/from-url/route";

const VEHICLE_ID = "veh-inline-001";
const DEALER_ID = "dealer-001";
const URL = "https://example.com/car";

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/vehicles/from-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  // Ensure SYNC_SECRET is NOT set so the inline fallback path runs
  delete process.env.SYNC_SECRET;

  (prisma.vehicle.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: VEHICLE_ID });
  (prisma.vehicle.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (prisma.vehicle.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (prisma.crawlSnapshot.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
});

describe("POST /api/vehicles/from-url — inline scrape images[] sync", () => {
  it("persists images: [imageUrl] when imageUrl is present", async () => {
    vi.mocked(scrapeVehicleUrl).mockResolvedValue({
      vehicle: {
        id: VEHICLE_ID,
        dealerId: DEALER_ID,
        url: URL,
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
        description: "2022 Honda Civic",
        address: null,
        latitude: null,
        longitude: null,
        isComplete: true,
        missingFields: [],
      },
      url: URL,
      fieldsExtracted: ["make", "model", "image_url"],
    });

    const res = await POST(makeRequest({ url: URL }));
    expect(res.status).toBe(202);

    const updateCall = vi.mocked(prisma.vehicle.update).mock.calls.find(
      (call) => (call[0] as { data: Record<string, unknown> }).data.scrapeStatus === "complete"
    );
    expect(updateCall).toBeDefined();
    const data = (updateCall![0] as { data: Record<string, unknown> }).data;
    expect(data.imageUrl).toBe("https://example.com/img.jpg");
    expect(data.images).toEqual(["https://example.com/img.jpg"]);
  });

  it("persists address, latitude, and longitude when present on scrape result", async () => {
    vi.mocked(scrapeVehicleUrl).mockResolvedValue({
      vehicle: {
        id: VEHICLE_ID,
        dealerId: DEALER_ID,
        url: URL,
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
        description: "2022 Honda Civic",
        address: "500 Market St, San Francisco, CA 94105",
        latitude: 37.7897,
        longitude: -122.3972,
        isComplete: true,
        missingFields: [],
      },
      url: URL,
      fieldsExtracted: ["make", "model", "address", "latitude", "longitude"],
    });

    const res = await POST(makeRequest({ url: URL }));
    expect(res.status).toBe(202);

    const updateCall = vi.mocked(prisma.vehicle.update).mock.calls.find(
      (call) => (call[0] as { data: Record<string, unknown> }).data.scrapeStatus === "complete"
    );
    expect(updateCall).toBeDefined();
    const data = (updateCall![0] as { data: Record<string, unknown> }).data;
    expect(data.address).toBe("500 Market St, San Francisco, CA 94105");
    expect(data.latitude).toBe(37.7897);
    expect(data.longitude).toBe(-122.3972);
  });

  it("persists null address, latitude, and longitude when missing/invalid on scrape result", async () => {
    vi.mocked(scrapeVehicleUrl).mockResolvedValue({
      vehicle: {
        id: VEHICLE_ID,
        dealerId: DEALER_ID,
        url: URL,
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
        description: "2022 Honda Civic",
        address: null,
        latitude: null,
        longitude: null,
        isComplete: true,
        missingFields: [],
      },
      url: URL,
      fieldsExtracted: ["make", "model"],
    });

    const res = await POST(makeRequest({ url: URL }));
    expect(res.status).toBe(202);

    const updateCall = vi.mocked(prisma.vehicle.update).mock.calls.find(
      (call) => (call[0] as { data: Record<string, unknown> }).data.scrapeStatus === "complete"
    );
    expect(updateCall).toBeDefined();
    const data = (updateCall![0] as { data: Record<string, unknown> }).data;
    expect(data.address).toBeNull();
    expect(data.latitude).toBeNull();
    expect(data.longitude).toBeNull();
  });

  it("persists images: [] when imageUrl is null", async () => {

  vi.mocked(scrapeVehicleUrl).mockResolvedValue({
      vehicle: {
        id: VEHICLE_ID,
        dealerId: DEALER_ID,
        url: URL,
        vin: null,
        make: "Honda",
        model: "Civic",
        year: "2022",
        bodyStyle: null,
        price: 24500,
        mileageValue: null,
        stateOfVehicle: "Used",
        exteriorColor: null,
        imageUrl: null,
        description: "2022 Honda Civic",
        address: null,
        latitude: null,
        longitude: null,
        isComplete: true,
        missingFields: [],
      },
      url: URL,
      fieldsExtracted: ["make", "model"],
    });

    const res = await POST(makeRequest({ url: URL }));
    expect(res.status).toBe(202);

    const updateCall = vi.mocked(prisma.vehicle.update).mock.calls.find(
      (call) => (call[0] as { data: Record<string, unknown> }).data.scrapeStatus === "complete"
    );
    expect(updateCall).toBeDefined();
    const data = (updateCall![0] as { data: Record<string, unknown> }).data;
    expect(data.imageUrl).toBeNull();
    expect(data).not.toHaveProperty("images");
  });
});

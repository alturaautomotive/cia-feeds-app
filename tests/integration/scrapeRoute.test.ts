import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vehicle: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Mock scrape module
vi.mock("@/lib/scrape", () => ({
  scrapeVehicleUrl: vi.fn(),
}));

// Mock logger (noop)
vi.mock("@/lib/logger", () => ({
  logScrapeStart: vi.fn(),
  logScrapeEnd: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { scrapeVehicleUrl } from "@/lib/scrape";
import { POST } from "@/app/api/vehicles/scrape/route";

const VEHICLE_ID = "veh-001";
const DEALER_ID = "dealer-001";
const URL = "https://example.com/car";

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/vehicles/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sync-secret": "test-secret",
    },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SYNC_SECRET = "test-secret";
  (prisma.vehicle.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (prisma.vehicle.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

describe("POST /api/vehicles/scrape — images[] sync", () => {
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
        isComplete: true,
        missingFields: [],
      },
      url: URL,
      fieldsExtracted: ["make", "model", "image_url"],
    });

    const res = await POST(makeRequest({ vehicleId: VEHICLE_ID, url: URL, dealerId: DEALER_ID }));
    expect(res.status).toBe(200);

    const updateCall = vi.mocked(prisma.vehicle.update).mock.calls.find(
      (call) => (call[0] as { data: Record<string, unknown> }).data.scrapeStatus === "complete"
    );
    expect(updateCall).toBeDefined();
    const data = (updateCall![0] as { data: Record<string, unknown> }).data;
    expect(data.imageUrl).toBe("https://example.com/img.jpg");
    expect(data.images).toEqual(["https://example.com/img.jpg"]);
  });

  it("does not overwrite images when imageUrl is null (preserves existing images)", async () => {
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
        isComplete: true,
        missingFields: [],
      },
      url: URL,
      fieldsExtracted: ["make", "model"],
    });

    const res = await POST(makeRequest({ vehicleId: VEHICLE_ID, url: URL, dealerId: DEALER_ID }));
    expect(res.status).toBe(200);

    const updateCall = vi.mocked(prisma.vehicle.update).mock.calls.find(
      (call) => (call[0] as { data: Record<string, unknown> }).data.scrapeStatus === "complete"
    );
    expect(updateCall).toBeDefined();
    const data = (updateCall![0] as { data: Record<string, unknown> }).data;
    expect(data.imageUrl).toBeNull();
    // images key should be absent so existing images[] are preserved
    expect(data).not.toHaveProperty("images");
  });

  it("rescrape of vehicle with existing images preserves them when scrape returns no image", async () => {
    // Simulate a vehicle that already has images stored in DB.
    // The scrape returns no imageUrl — existing images must NOT be cleared.
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
        price: 25000,
        mileageValue: 20000,
        stateOfVehicle: "Used",
        exteriorColor: "Black",
        imageUrl: null,
        description: "Updated description",
        isComplete: true,
        missingFields: [],
      },
      url: URL,
      fieldsExtracted: ["make", "model", "price"],
    });

    const res = await POST(makeRequest({ vehicleId: VEHICLE_ID, url: URL, dealerId: DEALER_ID }));
    expect(res.status).toBe(200);

    const updateCall = vi.mocked(prisma.vehicle.update).mock.calls.find(
      (call) => (call[0] as { data: Record<string, unknown> }).data.scrapeStatus === "complete"
    );
    expect(updateCall).toBeDefined();
    const data = (updateCall![0] as { data: Record<string, unknown> }).data;

    // images must not be in the update payload — DB keeps whatever was there before
    expect(data).not.toHaveProperty("images");
    // Other fields are still updated normally
    expect(data.price).toBe(25000);
    expect(data.description).toBe("Updated description");
  });

  it("rescrape overwrites images when scrape returns a new imageUrl", async () => {
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
        price: 25000,
        mileageValue: 20000,
        stateOfVehicle: "Used",
        exteriorColor: "Black",
        imageUrl: "https://example.com/new-img.jpg",
        description: "Updated description",
        isComplete: true,
        missingFields: [],
      },
      url: URL,
      fieldsExtracted: ["make", "model", "price", "image_url"],
    });

    const res = await POST(makeRequest({ vehicleId: VEHICLE_ID, url: URL, dealerId: DEALER_ID }));
    expect(res.status).toBe(200);

    const updateCall = vi.mocked(prisma.vehicle.update).mock.calls.find(
      (call) => (call[0] as { data: Record<string, unknown> }).data.scrapeStatus === "complete"
    );
    expect(updateCall).toBeDefined();
    const data = (updateCall![0] as { data: Record<string, unknown> }).data;

    // When a new image is scraped, images should be updated
    expect(data.images).toEqual(["https://example.com/new-img.jpg"]);
    expect(data.imageUrl).toBe("https://example.com/new-img.jpg");
  });
});

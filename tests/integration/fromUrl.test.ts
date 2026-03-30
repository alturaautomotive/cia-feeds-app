import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vehicle: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock next-auth session
vi.mock("next-auth", () => ({
  default: vi.fn(),
  getServerSession: vi.fn().mockResolvedValue({
    user: { id: "dealer-123", name: "Test Dealer", email: "test@test.com" },
  }),
}));

// Mock Firecrawl at the SDK wrapper boundary, keeping the real scrapeVehicleUrl path
vi.mock("@/lib/firecrawl", () => ({
  firecrawlClient: {
    scrapeUrl: vi.fn(),
  },
}));

import { firecrawlClient } from "@/lib/firecrawl";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/vehicles/from-url/route";
import { EXTRACTION_SCHEMA } from "@/lib/extractionSchema";

const FIRECRAWL_FULL_RESPONSE = {
  success: true,
  json: {
    vin: "1HGBH41JXMN109186",
    make: "Honda",
    model: "Civic",
    year: "2022",
    body_style: null,
    price: "$24,500",
    mileage_value: "18,200 mi",
    state_of_vehicle: "Used",
    exterior_color: "White",
    image_url: "https://example.com/img.jpg",
    description: null,
  },
};

// Clear all mock call counts before every test across all describe blocks
beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/vehicles/from-url", () => {
  beforeEach(() => {
    vi.mocked(firecrawlClient.scrapeUrl).mockResolvedValue(
      FIRECRAWL_FULL_RESPONSE as never
    );
    (prisma.vehicle.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.vehicle.create as ReturnType<typeof vi.fn>).mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...args.data, createdAt: new Date(), updatedAt: new Date() })
    );
  });

  it("calls Firecrawl with structured extraction schema options", async () => {
    const req = new Request("http://localhost:3000/api/vehicles/from-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/vehicle" }),
    });

    await POST(req as Parameters<typeof POST>[0]);

    expect(firecrawlClient.scrapeUrl).toHaveBeenCalledWith(
      "https://example.com/vehicle",
      expect.objectContaining({
        formats: expect.arrayContaining(["json"]),
        jsonOptions: expect.objectContaining({
          schema: EXTRACTION_SCHEMA,
        }),
      })
    );
  });

  it("returns vehicle and missingFields for valid URL", async () => {
    const req = new Request("http://localhost:3000/api/vehicles/from-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/vehicle" }),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    const data = await res.json();

    expect(res.status).toBeLessThan(300);
    expect(data.vehicle).toBeDefined();
    expect(data.missingFields).toBeInstanceOf(Array);
    expect(data.vehicle.make).toBe("Honda");
    expect(data.vehicle.isComplete).toBe(true);
  });

  it("returns 400 for invalid URL", async () => {
    const req = new Request("http://localhost:3000/api/vehicles/from-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "not-a-url" }),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  it("propagates missingFields when state_of_vehicle is absent from Firecrawl response", async () => {
    vi.mocked(firecrawlClient.scrapeUrl).mockResolvedValueOnce({
      success: true,
      json: {
        vin: null,
        make: "Honda",
        model: "Civic",
        year: "2022",
        body_style: null,
        price: "$24,500",
        mileage_value: "18,200 mi",
        state_of_vehicle: null,
        exterior_color: null,
        image_url: null,
        description: null,
      },
    } as never);

    (prisma.vehicle.create as ReturnType<typeof vi.fn>).mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...args.data, createdAt: new Date(), updatedAt: new Date() })
    );

    const req = new Request("http://localhost:3000/api/vehicles/from-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/vehicle-no-state" }),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    const data = await res.json();

    expect(data.missingFields).toContain("state_of_vehicle");
    expect(data.missingFields).not.toContain("stateOfVehicle");
  });
});

describe("POST /api/vehicles/from-url — idempotency", () => {
  it("updates existing vehicle instead of creating a duplicate", async () => {
    vi.mocked(firecrawlClient.scrapeUrl).mockResolvedValue(
      FIRECRAWL_FULL_RESPONSE as never
    );

    const existingVehicle = {
      id: "existing-id",
      dealerId: "dealer-123",
      url: "https://example.com/vehicle",
      make: "Honda",
      model: "Civic",
      year: "2021",
      price: 20000,
      stateOfVehicle: "Used",
      isComplete: true,
      missingFields: [],
    };

    (prisma.vehicle.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(existingVehicle);
    (prisma.vehicle.update as ReturnType<typeof vi.fn>).mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...existingVehicle, ...args.data, updatedAt: new Date() })
    );

    const req = new Request("http://localhost:3000/api/vehicles/from-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/vehicle" }),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(prisma.vehicle.update).toHaveBeenCalled();
    expect(prisma.vehicle.create).not.toHaveBeenCalled();
    expect(data.vehicle.id).toBe("existing-id");
  });
});

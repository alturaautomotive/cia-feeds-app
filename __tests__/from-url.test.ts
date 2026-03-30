import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Prisma before importing route
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vehicle: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock scrape module before importing route
vi.mock("@/lib/scrape", () => ({
  scrapeVehicleUrl: vi.fn(),
}));

// Mock next-auth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { scrapeVehicleUrl } from "@/lib/scrape";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/vehicles/from-url/route";

const DEALER_ID = "dealer-abc123";
const SAVED_VEHICLE = {
  id: "vehicle-001",
  dealerId: DEALER_ID,
  url: "https://example.com/vdp/accord",
  vin: "1HGCM82633A004352",
  make: "Honda",
  model: "Accord",
  year: 2023,
  bodyStyle: "Sedan",
  price: 28500,
  mileageValue: 5000,
  stateOfVehicle: "Used",
  exteriorColor: "White",
  imageUrl: "https://example.com/accord.jpg",
  description: "2023 Honda Accord in excellent condition",
  isComplete: true,
  missingFields: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const COMPLETE_PAYLOAD = {
  vin: "1HGCM82633A004352",
  make: "Honda",
  model: "Accord",
  year: "2023",
  body_style: "Sedan",
  price: "$28,500",
  mileage_value: "5,000 mi",
  state_of_vehicle: "Used",
  exterior_color: "White",
  image_url: "https://example.com/accord.jpg",
  description: "2023 Honda Accord in excellent condition",
};

const MAPPED_VEHICLE = {
  id: "vehicle-mapper-id",
  dealerId: DEALER_ID,
  url: "https://example.com/vdp/accord",
  vin: "1HGCM82633A004352",
  make: "Honda",
  model: "Accord",
  year: "2023",
  bodyStyle: "Sedan",
  price: 28500,
  mileageValue: 5000,
  stateOfVehicle: "Used",
  exteriorColor: "White",
  imageUrl: "https://example.com/accord.jpg",
  description: "2023 Honda Accord in excellent condition",
  isComplete: true,
  missingFields: [],
};

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/vehicles/from-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupDefaultMocks() {
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: DEALER_ID, name: "Test Dealer", email: "test@dealer.com" },
    expires: new Date(Date.now() + 86400000).toISOString(),
  });

  vi.mocked(scrapeVehicleUrl).mockResolvedValue({
    vehicle: MAPPED_VEHICLE,
    url: "https://example.com/vdp/accord",
    fieldsExtracted: Object.keys(COMPLETE_PAYLOAD),
  });

  vi.mocked(prisma.vehicle.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.vehicle.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.vehicle.create).mockResolvedValue(SAVED_VEHICLE as never);
  vi.mocked(prisma.vehicle.update).mockResolvedValue(SAVED_VEHICLE as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  setupDefaultMocks();
});

describe("POST /api/vehicles/from-url", () => {
  it("happy path: returns 200/201 with vehicle and empty missingFields", async () => {
    const res = await POST(makeRequest({ url: "https://example.com/vdp/accord" }));
    const body = await res.json();

    expect(res.status).toBeLessThan(300);
    expect(body.vehicle).toBeDefined();
    expect(body.vehicle.make).toBe("Honda");
    expect(body.vehicle.price).toBe(28500);
    expect(body.missingFields).toEqual([]);
  });

  it("missing fields path: missingFields contains 'price' when price is absent", async () => {
    vi.mocked(scrapeVehicleUrl).mockResolvedValue({
      vehicle: { ...MAPPED_VEHICLE, price: null, isComplete: false, missingFields: ["price"] },
      url: "https://example.com/vdp/corolla",
      fieldsExtracted: Object.keys(COMPLETE_PAYLOAD).filter((k) => k !== "price"),
    });

    const savedIncomplete = {
      ...SAVED_VEHICLE,
      price: null,
      isComplete: false,
      missingFields: ["price"],
    };
    vi.mocked(prisma.vehicle.create).mockResolvedValue(savedIncomplete as never);

    const res = await POST(makeRequest({ url: "https://example.com/vdp/corolla" }));
    const body = await res.json();

    expect(body.missingFields).toContain("price");
  });

  it("missing fields path: missingFields contains 'state_of_vehicle' (not 'stateOfVehicle') when state is absent", async () => {
    vi.mocked(scrapeVehicleUrl).mockResolvedValue({
      vehicle: {
        ...MAPPED_VEHICLE,
        stateOfVehicle: null,
        isComplete: false,
        missingFields: ["state_of_vehicle"],
      },
      url: "https://example.com/vdp/no-state",
      fieldsExtracted: Object.keys(COMPLETE_PAYLOAD).filter((k) => k !== "state_of_vehicle"),
    });

    const savedIncomplete = {
      ...SAVED_VEHICLE,
      stateOfVehicle: null,
      isComplete: false,
      missingFields: ["state_of_vehicle"],
    };
    vi.mocked(prisma.vehicle.create).mockResolvedValue(savedIncomplete as never);

    const res = await POST(makeRequest({ url: "https://example.com/vdp/no-state" }));
    const body = await res.json();

    expect(body.missingFields).toContain("state_of_vehicle");
    expect(body.missingFields).not.toContain("stateOfVehicle");
  });

  it("idempotency: calls prisma.vehicle.update on second POST with same URL", async () => {
    const vdpUrl = "https://example.com/vdp/idempotency";

    // First POST — no existing vehicle, should create
    await POST(makeRequest({ url: vdpUrl }));
    expect(prisma.vehicle.create).toHaveBeenCalledTimes(1);
    expect(prisma.vehicle.update).toHaveBeenCalledTimes(0);

    // Reset call counts but keep implementations
    vi.mocked(prisma.vehicle.create).mockClear();
    vi.mocked(prisma.vehicle.update).mockClear();

    // Second POST — existing vehicle found, should update
    vi.mocked(prisma.vehicle.findFirst).mockResolvedValue({ id: "existing-id" } as never);
    await POST(makeRequest({ url: vdpUrl }));

    expect(prisma.vehicle.update).toHaveBeenCalledTimes(1);
    expect(prisma.vehicle.create).toHaveBeenCalledTimes(0);
  });

  it("returns 502 with error 'scrape_failed' when Firecrawl throws", async () => {
    vi.mocked(scrapeVehicleUrl).mockRejectedValue(new Error("Network timeout"));

    const res = await POST(makeRequest({ url: "https://example.com/vdp/error" }));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe("scrape_failed");
  });

  it("returns 400 with error 'invalid_url' for non-URL input", async () => {
    const res = await POST(makeRequest({ url: "not-a-url" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_url");
  });
});

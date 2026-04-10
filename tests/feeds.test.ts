import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// vi.mock is hoisted before imports by Vitest
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealer: {
      findUnique: vi.fn(),
    },
    vehicle: {
      findMany: vi.fn(),
    },
  },
}));

// Static imports after mock setup
import { prisma } from "@/lib/prisma";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — dynamic route path contains brackets; resolved correctly at runtime
import { GET } from "@/app/feeds/[slug]/route";

const mockDealer = {
  id: "dealer-uuid-feeds",
  name: "Test Dealer",
  slug: "test-dealer",
  vertical: "automotive",
};

const mockVehicles = [
  {
    id: "veh-1",
    dealerId: "dealer-uuid-feeds",
    description: "2023 Toyota Camry",
    vin: "4T1BF3EK5AU123456",
    make: "Toyota",
    model: "Camry",
    year: 2023,
    bodyStyle: "Sedan",
    price: 27500,
    mileageValue: 5000,
    stateOfVehicle: "Used",
    exteriorColor: "Silver",
    url: "https://dealer.com/camry",
    imageUrl: "https://img.com/camry.jpg",
    images: ["https://img.com/camry.jpg"],
    dealer: { name: "Test Dealer" },
    isComplete: true,
    missingFields: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  },
  {
    id: "veh-2",
    dealerId: "dealer-uuid-feeds",
    description: "2020 Chevy Silverado",
    vin: null,
    make: "Chevrolet",
    model: "Silverado",
    year: 2020,
    bodyStyle: "Truck",
    price: 34000,
    mileageValue: 45000,
    stateOfVehicle: "Used",
    exteriorColor: null,
    url: "https://dealer.com/silverado",
    imageUrl: null,
    images: [],
    dealer: { name: "Test Dealer" },
    isComplete: false,
    missingFields: ["vin", "exteriorColor", "imageUrl"],
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  },
];

describe("GET /feeds/[slug].csv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with correct Content-Type and headers for a valid dealer", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(mockDealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue(mockVehicles as never);

    const req = new NextRequest("http://localhost:3000/feeds/test-dealer.csv");
    const res = await GET(req, { params: { slug: "test-dealer.csv" } });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="test-dealer.csv"');
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("returns the correct CSV header row", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(mockDealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue(mockVehicles as never);

    const req = new NextRequest("http://localhost:3000/feeds/test-dealer.csv");
    const res = await GET(req, { params: { slug: "test-dealer.csv" } });

    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);

    expect(lines[0]).toBe(
      "dealer_name,vin,year,make,model,body_style,transmission,trim,mileage.value,drivetrain,exterior_color,msrp,price,description,image,fuel_type,address,state_of_vehicle,title,url,latitude,longitude,vehicle_id,mileage.unit,days_on_lot,fb_page_id,link,availability,condition,brand"
    );
  });

  it("serializes vehicle rows with correct values including dealer_name and mileage.value", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(mockDealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue(mockVehicles as never);

    const req = new NextRequest("http://localhost:3000/feeds/test-dealer.csv");
    const res = await GET(req, { params: { slug: "test-dealer.csv" } });

    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);

    expect(lines[1]).toContain("Toyota");
    expect(lines[1]).toContain("27500");
    expect(lines[1]).toContain("Test Dealer"); // dealer_name
    expect(lines[1]).toContain("5000"); // mileage.value
    expect(lines[1]).toContain("https://img.com/camry.jpg"); // image
    expect(lines[2]).toContain("Chevrolet");
    expect(lines[2]).toContain("34000");
    expect(lines[2]).toContain("Test Dealer"); // dealer_name
    expect(lines[2]).toContain("45000"); // mileage.value
  });

  it("renders null fields as empty strings, not the literal 'null'", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(mockDealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue(mockVehicles as never);

    const req = new NextRequest("http://localhost:3000/feeds/test-dealer.csv");
    const res = await GET(req, { params: { slug: "test-dealer.csv" } });

    const text = await res.text();
    expect(text).not.toContain("null");
  });

  it("returns 404 for an unknown slug", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/feeds/nonexistent-slug.csv");
    const res = await GET(req, { params: { slug: "nonexistent-slug.csv" } });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "dealer_not_found" });
  });
});

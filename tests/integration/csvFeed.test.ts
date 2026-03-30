import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock must be hoisted before imports
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealer: { findUnique: vi.fn() },
    vehicle: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
// @ts-ignore — dynamic route path contains brackets; resolved correctly at runtime
import { GET } from "@/app/feeds/[slug]/route";

const dealer = {
  id: "dealer-int-uuid",
  name: "Integration Dealer",
  slug: "int-dealer",
};

function makeVehicle(overrides: Partial<{
  id: string;
  description: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: string;
  bodyStyle: string | null;
  price: number | null;
  mileageValue: number | null;
  stateOfVehicle: string | null;
  exteriorColor: string | null;
  url: string;
  imageUrl: string | null;
}> = {}) {
  return {
    id: "v-int-default",
    dealerId: dealer.id,
    description: "Test Vehicle",
    vin: "VIN000001",
    make: "Toyota",
    model: "Corolla",
    year: "2022",
    bodyStyle: "Sedan",
    price: 20000,
    mileageValue: 5000,
    stateOfVehicle: "New",
    exteriorColor: "Blue",
    url: "https://dealer.com/corolla",
    imageUrl: null,
    isComplete: true,
    missingFields: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("GET /feeds/[slug].csv — CSV contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns correct response headers and CSV header row for a seeded dealer", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({ id: "v-int-1", make: "Honda", model: "Civic", price: 24500, vin: "1HGBH41JXMN109186" }),
      makeVehicle({ id: "v-int-2", make: "Ford", model: "F-150", price: 38900, vin: null, exteriorColor: null, imageUrl: null }),
    ] as never);

    const req = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "int-dealer.csv" }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="int-dealer.csv"');
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");

    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);

    expect(lines[0]).toBe(
      "vehicle_id,description,vin,make,model,year,body_style,price,mileage_value,state_of_vehicle,exterior_color,url,image_url"
    );
    expect(lines[1]).toContain("Honda");
    expect(lines[1]).toContain("24500");
    expect(lines[2]).toContain("Ford");
    // null DB values must become empty strings, never the literal word "null"
    expect(lines[2]).not.toContain("null");
  });

  it("returns 404 for an unknown slug", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/feeds/no-such.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "no-such.csv" }) });

    expect(res.status).toBe(404);
  });

  // ── RFC 4180 escaping ──────────────────────────────────────────────────────

  it("wraps fields containing commas in double-quotes per RFC 4180", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({ id: "v-comma", description: "Luxury, Sport Edition" }),
    ] as never);

    const req = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);

    expect(lines[1]).toContain('"Luxury, Sport Edition"');
  });

  it("doubles double-quotes inside quoted fields per RFC 4180", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({ id: "v-quote", description: '18" Alloy Wheels' }),
    ] as never);

    const req = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);

    // Inner double-quote is escaped as "" within the outer quoted field
    expect(lines[1]).toContain('"18"" Alloy Wheels"');
  });

  it("wraps fields containing embedded newlines in double-quotes per RFC 4180", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({ id: "v-newline", description: "Line one\nLine two" }),
    ] as never);

    const req = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text = await res.text();

    expect(text).toContain('"Line one\nLine two"');
  });

  it("uses CRLF line endings for every row including the header", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({ id: "v-crlf" }),
    ] as never);

    const req = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text = await res.text();

    // Every row must end with CRLF
    const rows = text.split("\r\n");
    // header + 1 data row + trailing empty string from final \r\n
    expect(rows.length).toBeGreaterThanOrEqual(3);
    // No bare LF without a preceding CR
    expect(text).not.toMatch(/(?<!\r)\n/);
  });
});

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
  images: string[];
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
    images: [],
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

  // ── Dynamic vehicle changes ────────────────────────────────────────────────

  it("newly added vehicle appears in feed", async () => {
    // First GET — no vehicles
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([] as never);

    const req1 = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res1 = await GET(req1, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text1 = await res1.text();
    const lines1 = text1.split("\r\n").filter(Boolean);

    expect(lines1.length).toBe(1); // header only

    // Second GET — one vehicle added
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({ id: "v-new", make: "Nissan", model: "Altima", vin: "1N4AL3AP8JC123456" }),
    ] as never);

    const req2 = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res2 = await GET(req2, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text2 = await res2.text();
    const lines2 = text2.split("\r\n").filter(Boolean);

    expect(lines2.length).toBe(2);
    expect(lines2[1]).toContain("Nissan");
    expect(lines2[1]).toContain("Altima");
    expect(lines2[1]).toContain("1N4AL3AP8JC123456");
  });

  it("updated vehicle fields appear in feed", async () => {
    // First GET — vehicle at price 20000
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({ id: "v-update", price: 20000 }),
    ] as never);

    const req1 = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res1 = await GET(req1, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text1 = await res1.text();
    const lines1 = text1.split("\r\n").filter(Boolean);
    expect(lines1[1]).toContain("20000");

    // Second GET — same vehicle updated to price 25000
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({ id: "v-update", price: 25000 }),
    ] as never);

    const req2 = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res2 = await GET(req2, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text2 = await res2.text();
    const lines2 = text2.split("\r\n").filter(Boolean);

    expect(lines2[1]).toContain("25000");
    expect(lines2[1]).not.toContain("20000");
  });

  it("images[] takes priority over imageUrl, falls back when empty", async () => {
    // Sub-case A — images array wins and first element is used, not second
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({
        id: "v-img-a",
        images: ["https://cdn.com/photo1.jpg", "https://cdn.com/photo2.jpg"],
        imageUrl: "https://old.com/fallback.jpg",
      }),
    ] as never);

    const req1 = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res1 = await GET(req1, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text1 = await res1.text();
    const lines1 = text1.split("\r\n").filter(Boolean);

    expect(lines1[1]).toContain("https://cdn.com/photo1.jpg");
    expect(lines1[1]).not.toContain("https://cdn.com/photo2.jpg");
    expect(lines1[1]).not.toContain("https://old.com/fallback.jpg");

    // Sub-case B — empty images falls back to imageUrl
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({
        id: "v-img-b",
        images: [],
        imageUrl: "https://old.com/fallback.jpg",
      }),
    ] as never);

    const req2 = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res2 = await GET(req2, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text2 = await res2.text();
    const lines2 = text2.split("\r\n").filter(Boolean);

    expect(lines2[1]).toContain("https://old.com/fallback.jpg");
  });

  it("pagination: >100 vehicles yields all rows", async () => {
    const batch1 = Array.from({ length: 100 }, (_, i) =>
      makeVehicle({ id: `v-batch1-${i}` })
    );
    const batch2 = Array.from({ length: 50 }, (_, i) =>
      makeVehicle({ id: `v-batch2-${i}`, make: "Batch2Make", vin: `VIN2-${i}` })
    );

    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany)
      .mockResolvedValueOnce(batch1 as never)
      .mockResolvedValueOnce(batch2 as never);

    const req = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);

    expect(lines.length).toBe(151); // 1 header + 150 data rows
    expect(lines.some((l) => l.includes("Batch2Make"))).toBe(true);
  });
});

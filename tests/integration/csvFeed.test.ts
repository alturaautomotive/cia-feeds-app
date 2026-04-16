import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock must be hoisted before imports
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealer: { findUnique: vi.fn() },
    vehicle: { findMany: vi.fn() },
    listing: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { VEHICLE_CSV_HEADERS } from "@/lib/csv";
// @ts-ignore — dynamic route path contains brackets; resolved correctly at runtime
import { GET } from "@/app/feeds/[slug]/route";

const dealer = {
  id: "dealer-int-uuid",
  name: "Integration Dealer",
  slug: "int-dealer",
  vertical: "automotive",
  address: "100 Test Blvd, Test City, TX 75001",
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
  fuelType: string | null;
  transmission: string | null;
  drivetrain: string | null;
  trim: string | null;
  msrp: number | null;
  url: string;
  imageUrl: string | null;
  images: string[];
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  dealer: { name: string; fbPageId?: string | null; address?: string | null; latitude?: number | null; longitude?: number | null } | null;
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
    fuelType: "Gasoline",
    transmission: "Automatic",
    drivetrain: "FWD",
    trim: "LE",
    msrp: null,
    url: "https://dealer.com/corolla",
    imageUrl: "https://img.test/default.jpg",
    images: ["https://img.test/default.jpg"],
    address: "100 Test Blvd, Test City, TX 75001",
    latitude: null,
    longitude: null,
    dealer: { name: dealer.name, fbPageId: "fb-page-int-123" },
    isComplete: true,
    missingFields: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
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

    expect(lines[0]).toBe(VEHICLE_CSV_HEADERS.join(","));
    expect(lines[1]).toContain("Honda");
    expect(lines[1]).toContain("24500 USD");
    expect(lines[1]).toContain("5000"); // mileage.value
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
    expect(lines1[1]).toContain("20000 USD");

    // Second GET — same vehicle updated to price 25000
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({ id: "v-update", price: 25000 }),
    ] as never);

    const req2 = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res2 = await GET(req2, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text2 = await res2.text();
    const lines2 = text2.split("\r\n").filter(Boolean);

    expect(lines2[1]).toContain("25000 USD");
    expect(lines2[1]).not.toContain("20000 USD");
  });

  it("image column uses imageUrl with fallback to images[0]", async () => {
    // Sub-case A — imageUrl is used when present
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({
        id: "v-img-a",
        images: ["https://cdn.com/photo1.jpg"],
        imageUrl: "https://primary.com/main.jpg",
      }),
    ] as never);

    const req1 = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res1 = await GET(req1, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text1 = await res1.text();
    const lines1 = text1.split("\r\n").filter(Boolean);

    // imageUrl takes priority over images[0]
    expect(lines1[1]).toContain("https://primary.com/main.jpg");

    // Sub-case B — falls back to images[0] when imageUrl is null
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({
        id: "v-img-b",
        images: ["https://cdn.com/fallback.jpg"],
        imageUrl: null,
      }),
    ] as never);

    const req2 = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res2 = await GET(req2, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text2 = await res2.text();
    const lines2 = text2.split("\r\n").filter(Boolean);

    expect(lines2[1]).toContain("https://cdn.com/fallback.jpg");

    // Sub-case C — vehicle with no images is filtered from the feed
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({
        id: "v-img-c",
        images: [],
        imageUrl: null,
      }),
    ] as never);

    const req3 = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res3 = await GET(req3, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text3 = await res3.text();
    const lines3 = text3.split("\r\n").filter(Boolean);

    expect(lines3.length).toBe(1); // header only, no data row
  });

  it("automotive feed populates url, make, and state_of_vehicle columns", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({ id: "v-meta-1", make: "Honda", model: "Civic", stateOfVehicle: "New", url: "https://dealer.com/civic" }),
      makeVehicle({ id: "v-meta-2", make: "Ford", model: "F-150", stateOfVehicle: "Used", url: "https://dealer.com/f150" }),
      makeVehicle({ id: "v-meta-3", make: "BMW", model: "X5", stateOfVehicle: "Certified Used", url: "https://dealer.com/x5" }),
      makeVehicle({ id: "v-meta-4", make: "Tesla", model: "Model 3", stateOfVehicle: null, url: "https://dealer.com/model3" }),
    ] as never);

    const req = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);
    const headers = lines[0].split(",");
    const urlIdx = headers.indexOf("url");
    const stateIdx = headers.indexOf("state_of_vehicle");
    const makeIdx = headers.indexOf("make");

    // Row 1: New Honda
    const cols1 = lines[1].split(",");
    expect(cols1[urlIdx]).toBe("https://dealer.com/civic");
    expect(cols1[stateIdx]).toBe("NEW");
    expect(cols1[makeIdx]).toBe("Honda");

    // Row 2: Used Ford
    const cols2 = lines[2].split(",");
    expect(cols2[urlIdx]).toBe("https://dealer.com/f150");
    expect(cols2[stateIdx]).toBe("USED");
    expect(cols2[makeIdx]).toBe("Ford");

    // Row 3: Certified Used BMW → state_of_vehicle = "CPO"
    const cols3 = lines[3].split(",");
    expect(cols3[stateIdx]).toBe("CPO");
    expect(cols3[makeIdx]).toBe("BMW");

    // Row 4: null stateOfVehicle → state_of_vehicle = ""
    const cols4 = lines[4].split(",");
    expect(cols4[stateIdx]).toBe("");
    expect(cols4[makeIdx]).toBe("Tesla");
  });

  it("automotive feed populates address columns when present", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({
        id: "v-geo-1",
        make: "Honda",
        model: "Civic",
        address: "123 Main St, Springfield, IL 62701",
      }),
      makeVehicle({
        id: "v-geo-2",
        make: "Ford",
        model: "F-150",
        address: null,
      }),
    ] as never);

    const req = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);
    const headers = lines[0].split(",");

    const streetIdx = headers.indexOf("street_address");
    const cityIdx = headers.indexOf("city");
    const regionIdx = headers.indexOf("region");
    const postalIdx = headers.indexOf("postal_code");
    const countryIdx = headers.indexOf("country");

    // Row 1: populated address with comma-separated parts
    const cols1 = lines[1].split(",");
    expect(cols1[streetIdx]).toBe("123 Main St");
    expect(cols1[cityIdx]).toBe("Springfield");
    expect(cols1[regionIdx]).toBe("IL");
    expect(cols1[postalIdx]).toBe("62701");
    expect(cols1[countryIdx]).toBe("US");

    // v-geo-2 has null address → filtered out by csv_missing_address guard
    expect(lines.length).toBe(2); // header + v-geo-1 only
  });

  it("vehicle with null address and no dealer address is excluded by csv_missing_address guard", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({
        id: "v-no-addr",
        make: "Kia",
        model: "Sorento",
        address: null,
        dealer: { name: dealer.name },
      }),
    ] as never);

    const req = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);

    // Only the header row — vehicle with no address is skipped
    expect(lines.length).toBe(1);

    // Verify the csv_missing_address log event was emitted
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: "csv_missing_address", vehicleId: "v-no-addr" })
    );

    logSpy.mockRestore();
  });

  it("automotive feed normalizes compound body_style values", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({ id: "v-compound-body", bodyStyle: "Minivan/Van" }),
    ] as never);

    const req = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);
    const headers = lines[0].split(",");
    const bodyIdx = headers.indexOf("body_style");
    const cols = lines[1].split(",");

    expect(cols[bodyIdx]).toBe("MINIVAN");
  });

  // ── Ecommerce vertical CSV contract ──────────────────────────────────────

  it("ecommerce feed has correct CSV header row with link and image columns", async () => {
    const ecomDealer = { id: "dealer-ecom-uuid", name: "Ecom Dealer", slug: "ecom-dealer", vertical: "ecommerce", address: "200 Commerce St, Dallas, TX 75201" };
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(ecomDealer as never);
    vi.mocked(prisma.listing.findMany).mockResolvedValue([] as never);

    const req = new Request("http://localhost:3000/feeds/ecom-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "ecom-dealer.csv" }) });

    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);

    expect(lines[0]).toBe(
      "id,title,description,price,brand,condition,availability,retailer_id,link,image,google_product_category"
    );
  });

  it("ecommerce feed maps link from listing.url and image from listing.imageUrls[0]", async () => {
    const ecomDealer = { id: "dealer-ecom-uuid", name: "Ecom Dealer", slug: "ecom-dealer", vertical: "ecommerce", address: "200 Commerce St, Dallas, TX 75201" };
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(ecomDealer as never);
    vi.mocked(prisma.listing.findMany).mockResolvedValue([
      {
        id: "listing-1",
        dealerId: ecomDealer.id,
        vertical: "ecommerce",
        title: "Widget Pro",
        price: 4999,
        url: "https://shop.example.com/widget-pro",
        imageUrls: ["https://cdn.example.com/widget.jpg", "https://cdn.example.com/widget2.jpg"],
        data: { brand: "Acme", condition: "new", availability: "in stock", google_product_category: "Electronics" },
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);

    const req = new Request("http://localhost:3000/feeds/ecom-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "ecom-dealer.csv" }) });

    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);

    // Header is correct
    expect(lines[0]).toBe(
      "id,title,description,price,brand,condition,availability,retailer_id,link,image,google_product_category"
    );

    // Data row: parse CSV columns by splitting (no commas in test data values)
    const cols = lines[1].split(",");
    expect(cols[0]).toBe("listing-1");                            // id
    expect(cols[1]).toBe("Widget Pro");                            // title
    expect(cols[3]).toBe("4999");                                  // price
    expect(cols[4]).toBe("Acme");                                  // brand
    expect(cols[5]).toBe("new");                                   // condition
    expect(cols[6]).toBe("in stock");                              // availability
    expect(cols[8]).toBe("https://shop.example.com/widget-pro");   // link (from listing.url)
    expect(cols[9]).toBe("https://cdn.example.com/widget.jpg");    // image (from listing.imageUrls[0])
    expect(cols[10]).toBe("Electronics");                          // google_product_category
  });

  it("ecommerce feed falls back link to data.link when listing.url is null", async () => {
    const ecomDealer = { id: "dealer-ecom-uuid", name: "Ecom Dealer", slug: "ecom-dealer", vertical: "ecommerce", address: "200 Commerce St, Dallas, TX 75201" };
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(ecomDealer as never);
    vi.mocked(prisma.listing.findMany).mockResolvedValue([
      {
        id: "listing-fallback",
        dealerId: ecomDealer.id,
        vertical: "ecommerce",
        title: "Fallback Item",
        price: 1000,
        url: null,
        imageUrls: [],
        data: { link: "https://fallback.example.com/item", brand: "Generic" },
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);

    const req = new Request("http://localhost:3000/feeds/ecom-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "ecom-dealer.csv" }) });

    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);
    const cols = lines[1].split(",");

    expect(cols[8]).toBe("https://fallback.example.com/item"); // link falls back to data.link
    expect(cols[9]).toBe("");                                   // image empty when imageUrls is empty
  });

  it("automotive feed includes fuel_type, transmission, drivetrain, trim columns", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({ id: "v-fields", fuelType: "Diesel", transmission: "Manual", drivetrain: "AWD", trim: "XLE" }),
    ] as never);

    const req = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);
    const headers = lines[0].split(",");

    expect(headers).toContain("fuel_type");
    expect(headers).toContain("transmission");
    expect(headers).toContain("drivetrain");
    expect(headers).toContain("trim");

    const fuelIdx = headers.indexOf("fuel_type");
    const transIdx = headers.indexOf("transmission");
    const driveIdx = headers.indexOf("drivetrain");
    const trimIdx = headers.indexOf("trim");
    const cols = lines[1].split(",");

    expect(cols[fuelIdx]).toBe("DIESEL");
    expect(cols[transIdx]).toBe("MANUAL");
    expect(cols[driveIdx]).toBe("AWD");
    expect(cols[trimIdx]).toBe("XLE");
  });

  it("msrp is not capped at 100000 — luxury prices pass through", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({ id: "v-luxury", msrp: 250000 }),
    ] as never);

    const req = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);
    const headers = lines[0].split(",");
    const msrpIdx = headers.indexOf("msrp");
    const cols = lines[1].split(",");

    expect(cols[msrpIdx]).toBe("250000 USD");
  });

  it("vehicle with empty url is excluded from feed (header-only response)", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue(dealer as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      makeVehicle({ id: "v-empty-url", url: "", imageUrl: "https://img.test/photo.jpg", images: ["https://img.test/photo.jpg"] }),
    ] as never);

    const req = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "int-dealer.csv" }) });
    const text = await res.text();
    const lines = text.split("\r\n").filter(Boolean);

    expect(lines.length).toBe(1); // header only — vehicle with empty url is skipped
  });

  it("returns 422 when dealer has no address (null)", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      ...dealer,
      address: null,
    } as never);

    const req = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "int-dealer.csv" }) });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({ error: "dealer_address_required" });
    expect(prisma.vehicle.findMany).not.toHaveBeenCalled();
  });

  it("returns 422 when dealer has empty-string address", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      ...dealer,
      address: "",
    } as never);

    const req = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "int-dealer.csv" }) });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({ error: "dealer_address_required" });
    expect(prisma.vehicle.findMany).not.toHaveBeenCalled();
  });

  it("returns 422 when dealer has whitespace-only address", async () => {
    vi.mocked(prisma.dealer.findUnique).mockResolvedValue({
      ...dealer,
      address: "   ",
    } as never);

    const req = new Request("http://localhost:3000/feeds/int-dealer.csv");
    const res = await GET(req, { params: Promise.resolve({ slug: "int-dealer.csv" }) });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({ error: "dealer_address_required" });
    expect(prisma.vehicle.findMany).not.toHaveBeenCalled();
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

import { describe, it, expect } from "vitest";
import { mapVehicleToRow, serializeCSVRow, VEHICLE_CSV_HEADERS } from "@/lib/csv";
import { normalizeBodyStyle } from "@/lib/vehicleMapper";

const baseVehicle = {
  id: "veh-unit-1",
  description: "2023 Toyota Camry",
  vin: "4T1BF3EK5AU123456",
  make: "Toyota",
  model: "Camry",
  year: "2023",
  bodyStyle: "Sedan",
  price: 27500,
  mileageValue: 5000,
  stateOfVehicle: "Used",
  exteriorColor: "Silver",
  fuelType: "Gasoline",
  transmission: "Automatic",
  drivetrain: "FWD",
  trim: "SE",
  url: "https://dealer.com/camry",
  imageUrl: "https://img.com/camry.jpg",
  images: ["https://img.com/camry.jpg"],
  dealer: { name: "Test Dealer", fbPageId: "fb-page-unit-123" },
  address: null,
  latitude: null,
  longitude: null,
};

describe("mapVehicleToRow() — address resolution", () => {
  it("renders populated address into flat columns", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      address: "123 Main St, Springfield, IL 62701",
    });
    expect(row.street_address).toBe("123 Main St");
    expect(row.city).toBe("Springfield");
    expect(row.region).toBe("IL");
    expect(row.postal_code).toBe("62701");
    expect(row.country).toBe("US");
  });

  it("maps null address to empty strings", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      address: null,
    });
    expect(row.street_address).toBe("");
    expect(row.city).toBe("");
    expect(row.region).toBe("");
    expect(row.postal_code).toBe("");
    expect(row.country).toBe("");
  });

  it("does not emit the literal 'null' for null address when serialized", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      address: null,
    });
    const line = serializeCSVRow(row, VEHICLE_CSV_HEADERS);
    const header = VEHICLE_CSV_HEADERS;
    const addressIdx = header.indexOf("street_address");

    // Naive split is adequate — none of the base fixture fields contain commas.
    const fields = line.replace(/\r\n$/, "").split(",");
    expect(fields[addressIdx]).toBe("");
    expect(line.toLowerCase()).not.toContain("null");
  });

});

describe("mapVehicleToRow() — Meta-spec fields", () => {
  it("url field equals vehicle url", () => {
    const row = mapVehicleToRow(baseVehicle);
    expect(row.url).toBe(baseVehicle.url);
  });

  it("image[0].url equals imageUrl when present", () => {
    const row = mapVehicleToRow(baseVehicle);
    expect(row["image[0].url"]).toBe("https://img.com/camry.jpg");
  });

  it("image[0].url falls back to images[0] when imageUrl is null", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      imageUrl: null,
      images: ["https://cdn.com/fallback.jpg"],
    });
    expect(row["image[0].url"]).toBe("https://cdn.com/fallback.jpg");
  });

  it("image[0].url is empty string when both imageUrl and images are absent", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      imageUrl: null,
      images: [],
    });
    expect(row["image[0].url"]).toBe("");
  });

  it("image[0].url returns CDN URL without file extension when it is the only candidate", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      imageUrl: "https://cdn.example.com/vehicle/img?w=800&fmt=jpg",
      images: [],
    });
    expect(row["image[0].url"]).toBe("https://cdn.example.com/vehicle/img?w=800&fmt=jpg");
  });

  it("image[0].url returns first CDN URL when imageUrl is null and images have no extensions", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      imageUrl: null,
      images: [
        "https://cdn.example.com/a/img?w=800",
        "https://cdn.example.com/b/img?w=800",
      ],
    });
    expect(row["image[0].url"]).toBe("https://cdn.example.com/a/img?w=800");
  });

  it("image[0].url prefers .jpg URL over extension-less CDN URL", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      imageUrl: null,
      images: [
        "https://cdn.example.com/vehicle/img?w=800",
        "https://img.com/photo.jpg",
      ],
    });
    expect(row["image[0].url"]).toBe("https://img.com/photo.jpg");
  });

  it("state_of_vehicle outputs title-case: New, Used, CPO", () => {
    expect(mapVehicleToRow({ ...baseVehicle, stateOfVehicle: "New" }).state_of_vehicle).toBe("New");
    expect(mapVehicleToRow({ ...baseVehicle, stateOfVehicle: "Used" }).state_of_vehicle).toBe("Used");
    expect(mapVehicleToRow({ ...baseVehicle, stateOfVehicle: "Certified Used" }).state_of_vehicle).toBe("CPO");
    expect(mapVehicleToRow({ ...baseVehicle, stateOfVehicle: null }).state_of_vehicle).toBe("");
  });

  it("body_style normalizes known values and falls back to OTHER", () => {
    expect(normalizeBodyStyle("Sedan")).toBe("SEDAN");
    expect(normalizeBodyStyle("suv")).toBe("SUV");
    expect(normalizeBodyStyle("unknown style")).toBe("");
    expect(normalizeBodyStyle(null)).toBe("");
  });

  it("fuel_type, transmission, drivetrain, trim appear in CSV row", () => {
    const row = mapVehicleToRow(baseVehicle);
    expect(row.fuel_type).toBe("GASOLINE");
    expect(row.transmission).toBe("AUTOMATIC");
    expect(row.drivetrain).toBe("FWD");
    expect(row.trim).toBe("SE");

    // Verify they appear in the serialized CSV
    const line = serializeCSVRow(row, VEHICLE_CSV_HEADERS);
    expect(line).toContain("GASOLINE");
    expect(line).toContain("AUTOMATIC");
    expect(line).toContain("FWD");
    expect(line).toContain("SE");
  });

  it("fuel_type, transmission, drivetrain, trim default to empty string when null", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      fuelType: null,
      transmission: null,
      drivetrain: null,
      trim: null,
    });
    expect(row.fuel_type).toBe("");
    expect(row.transmission).toBe("");
    expect(row.drivetrain).toBe("");
    expect(row.trim).toBe("");
  });

  it("mileage.unit always equals 'MI'", () => {
    const row = mapVehicleToRow(baseVehicle);
    expect(row["mileage.unit"]).toBe("MI");
  });

  it("vin is uppercased", () => {
    const row = mapVehicleToRow({ ...baseVehicle, vin: "abc123" });
    expect(row.vin).toBe("ABC123");
  });

  it("title equals make + model", () => {
    const row = mapVehicleToRow(baseVehicle);
    expect(row.title).toBe("Toyota Camry");
  });

  it("url is empty string when url is empty (vehicle will be skipped by route guard)", () => {
    const row = mapVehicleToRow({ ...baseVehicle, url: "" });
    expect(row.url).toBe("");
  });

  it("price appends ' USD' suffix", () => {
    const row = mapVehicleToRow(baseVehicle);
    expect(row.price).toBe("27500 USD");
  });

  it("price is empty string when null", () => {
    const row = mapVehicleToRow({ ...baseVehicle, price: null });
    expect(row.price).toBe("");
  });

  it("msrp appends ' USD' suffix", () => {
    const row = mapVehicleToRow({ ...baseVehicle, msrp: 30000 });
    expect(row.msrp).toBe("30000 USD");
  });

  it("msrp is empty string when null", () => {
    const row = mapVehicleToRow({ ...baseVehicle, msrp: null });
    expect(row.msrp).toBe("");
  });

  it("exterior_color maps from exteriorColor", () => {
    const row = mapVehicleToRow(baseVehicle);
    expect(row.exterior_color).toBe("Silver");
  });

  it("exterior_color is empty string when null", () => {
    const row = mapVehicleToRow({ ...baseVehicle, exteriorColor: null });
    expect(row.exterior_color).toBe("");
  });

  it("latitude/longitude use vehicle coords when present", () => {
    const row = mapVehicleToRow({ ...baseVehicle, latitude: 40.7128, longitude: -74.006 });
    expect(row.latitude).toBe("40.7128");
    expect(row.longitude).toBe("-74.006");
  });

  it("latitude/longitude fall back to dealer coords", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      latitude: null,
      longitude: null,
      dealer: { name: "Test Dealer", fbPageId: "fb-page-unit-123", latitude: 34.0522, longitude: -118.2437 },
    });
    expect(row.latitude).toBe("34.0522");
    expect(row.longitude).toBe("-118.2437");
  });

  it("latitude/longitude are empty string when both null", () => {
    const row = mapVehicleToRow({ ...baseVehicle, latitude: null, longitude: null });
    expect(row.latitude).toBe("");
    expect(row.longitude).toBe("");
  });

  it("fb_page_id equals dealer fbPageId", () => {
    const row = mapVehicleToRow(baseVehicle);
    expect(row.fb_page_id).toBe("fb-page-unit-123");
  });

  it("fb_page_id is empty string when dealer has no fbPageId", () => {
    const row = mapVehicleToRow({ ...baseVehicle, dealer: { name: "No FB Dealer" } });
    expect(row.fb_page_id).toBe("");
  });

  it("image[1].url populated when multiple images exist", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      images: ["https://img.com/camry.jpg", "https://img.com/camry2.jpg"],
    });
    expect(row["image[1].url"]).toBe("https://img.com/camry2.jpg");
  });

  it("image[1].url is empty string for single-image vehicles", () => {
    const row = mapVehicleToRow(baseVehicle);
    expect(row["image[1].url"]).toBe("");
  });

  it("renders 2-part address into flat columns", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      address: "Springfield, IL 62701",
    });
    expect(row.street_address).toBe("");
    expect(row.city).toBe("Springfield");
    expect(row.region).toBe("IL");
    expect(row.postal_code).toBe("62701");
    expect(row.country).toBe("US");
  });

  it("renders 1-part (no-comma) address into flat columns", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      address: "123 Main St",
    });
    expect(row.street_address).toBe("123 Main St");
    expect(row.city).toBe("");
    expect(row.region).toBe("");
    expect(row.postal_code).toBe("");
    expect(row.country).toBe("US");
  });
});

describe("mapVehicleToRow() — CSV serialization", () => {
  it("flat address columns appear correctly in serialized CSV line", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      address: "123 Main St, Springfield, IL 62701",
    });
    const line = serializeCSVRow(row, VEHICLE_CSV_HEADERS);
    const fields = line.replace(/\r\n$/, "").split(",");
    expect(fields[VEHICLE_CSV_HEADERS.indexOf("street_address")]).toBe("123 Main St");
    expect(fields[VEHICLE_CSV_HEADERS.indexOf("city")]).toBe("Springfield");
    expect(fields[VEHICLE_CSV_HEADERS.indexOf("region")]).toBe("IL");
    expect(fields[VEHICLE_CSV_HEADERS.indexOf("postal_code")]).toBe("62701");
    expect(fields[VEHICLE_CSV_HEADERS.indexOf("country")]).toBe("US");
  });
});

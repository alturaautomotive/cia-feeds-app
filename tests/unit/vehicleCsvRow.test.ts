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
  dealer: { name: "Test Dealer" },
  address: null,
  latitude: null,
  longitude: null,
};

describe("mapVehicleToRow() — address resolution", () => {
  it("renders populated address into its column", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      address: "123 Main St, Springfield, IL 62701",
    });
    expect(row.address).toBe("123 Main St, Springfield, IL 62701");
  });

  it("maps null address to empty string", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      address: null,
    });
    expect(row.address).toBe("");
  });

  it("does not emit the literal 'null' for null address when serialized", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      address: null,
    });
    const line = serializeCSVRow(row, VEHICLE_CSV_HEADERS);
    const header = VEHICLE_CSV_HEADERS;
    const addressIdx = header.indexOf("address");

    // Naive split is adequate — none of the base fixture fields contain commas.
    const fields = line.replace(/\r\n$/, "").split(",");
    expect(fields[addressIdx]).toBe("");
    expect(line.toLowerCase()).not.toContain("null");
  });

});

describe("mapVehicleToRow() — Meta-spec fields", () => {
  it("link equals vehicle url", () => {
    const row = mapVehicleToRow(baseVehicle);
    expect(row.link).toBe(baseVehicle.url);
  });

  it("image_link equals imageUrl when present", () => {
    const row = mapVehicleToRow(baseVehicle);
    expect(row.image_link).toBe("https://img.com/camry.jpg");
  });

  it("image_link falls back to images[0] when imageUrl is null", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      imageUrl: null,
      images: ["https://cdn.com/fallback.jpg"],
    });
    expect(row.image_link).toBe("https://cdn.com/fallback.jpg");
  });

  it("image_link is empty string when both imageUrl and images are absent", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      imageUrl: null,
      images: [],
    });
    expect(row.image_link).toBe("");
  });

  it("image_link returns CDN URL without file extension when it is the only candidate", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      imageUrl: "https://cdn.example.com/vehicle/img?w=800&fmt=jpg",
      images: [],
    });
    expect(row.image_link).toBe("https://cdn.example.com/vehicle/img?w=800&fmt=jpg");
  });

  it("image_link returns first CDN URL when imageUrl is null and images have no extensions", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      imageUrl: null,
      images: [
        "https://cdn.example.com/a/img?w=800",
        "https://cdn.example.com/b/img?w=800",
      ],
    });
    expect(row.image_link).toBe("https://cdn.example.com/a/img?w=800");
  });

  it("image_link prefers .jpg URL over extension-less CDN URL", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      imageUrl: null,
      images: [
        "https://cdn.example.com/vehicle/img?w=800",
        "https://img.com/photo.jpg",
      ],
    });
    expect(row.image_link).toBe("https://img.com/photo.jpg");
  });

  it("availability always equals 'AVAILABLE'", () => {
    const row = mapVehicleToRow(baseVehicle);
    expect(row.availability).toBe("AVAILABLE");
  });

  it("condition is 'EXCELLENT' for stateOfVehicle 'New'", () => {
    const row = mapVehicleToRow({ ...baseVehicle, stateOfVehicle: "New" });
    expect(row.condition).toBe("EXCELLENT");
  });

  it("condition is 'GOOD' for stateOfVehicle 'Used'", () => {
    const row = mapVehicleToRow({ ...baseVehicle, stateOfVehicle: "Used" });
    expect(row.condition).toBe("GOOD");
  });

  it("condition is 'VERY_GOOD' for stateOfVehicle 'Certified Used' (CPO)", () => {
    const row = mapVehicleToRow({ ...baseVehicle, stateOfVehicle: "Certified Used" });
    expect(row.condition).toBe("VERY_GOOD");
  });

  it("condition defaults to 'GOOD' for null stateOfVehicle", () => {
    const row = mapVehicleToRow({ ...baseVehicle, stateOfVehicle: null });
    expect(row.condition).toBe("GOOD");
  });

  it("state_of_vehicle outputs uppercase: NEW, USED, CPO", () => {
    expect(mapVehicleToRow({ ...baseVehicle, stateOfVehicle: "New" }).state_of_vehicle).toBe("NEW");
    expect(mapVehicleToRow({ ...baseVehicle, stateOfVehicle: "Used" }).state_of_vehicle).toBe("USED");
    expect(mapVehicleToRow({ ...baseVehicle, stateOfVehicle: "Certified Used" }).state_of_vehicle).toBe("CPO");
    expect(mapVehicleToRow({ ...baseVehicle, stateOfVehicle: null }).state_of_vehicle).toBe("");
  });

  it("body_style normalizes known values and falls back to OTHER", () => {
    expect(normalizeBodyStyle("Sedan")).toBe("SEDAN");
    expect(normalizeBodyStyle("suv")).toBe("SUV");
    expect(normalizeBodyStyle("unknown style")).toBe("OTHER");
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

  it("link is empty string when url is empty (vehicle will be skipped by route guard)", () => {
    const row = mapVehicleToRow({ ...baseVehicle, url: "" });
    expect(row.link).toBe("");
  });
});

describe("mapVehicleToRow() — CSV serialization", () => {
  it("serializes populated address containing commas as a quoted CSV field", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      address: "123 Main St, Springfield, IL 62701",
    });
    const line = serializeCSVRow(row, VEHICLE_CSV_HEADERS);
    // Address must be quoted due to embedded commas.
    expect(line).toContain('"123 Main St, Springfield, IL 62701"');
  });
});

import { describe, it, expect } from "vitest";
import { mapVehicleToRow, serializeCSVRow, VEHICLE_CSV_HEADERS } from "@/lib/csv";

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
  url: "https://dealer.com/camry",
  imageUrl: "https://img.com/camry.jpg",
  images: ["https://img.com/camry.jpg"],
  dealer: { name: "Test Dealer" },
};

describe("mapVehicleToRow() — address, latitude, longitude", () => {
  it("renders populated address/latitude/longitude into their columns", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      address: "123 Main St, Springfield, IL 62701",
      latitude: 39.7817,
      longitude: -89.6501,
    });
    expect(row.address).toBe("123 Main St, Springfield, IL 62701");
    expect(row.latitude).toBe("39.7817");
    expect(row.longitude).toBe("-89.6501");
  });

  it("maps null address/latitude/longitude to empty strings", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      address: null,
      latitude: null,
      longitude: null,
    });
    expect(row.address).toBe("");
    expect(row.latitude).toBe("");
    expect(row.longitude).toBe("");
  });

  it("does not emit the literal 'null' for null address/lat/lng when serialized", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      address: null,
      latitude: null,
      longitude: null,
    });
    const line = serializeCSVRow(row, VEHICLE_CSV_HEADERS);
    const header = VEHICLE_CSV_HEADERS;
    const addressIdx = header.indexOf("address");
    const latIdx = header.indexOf("latitude");
    const lngIdx = header.indexOf("longitude");

    // Naive split is adequate — none of the base fixture fields contain commas.
    const fields = line.replace(/\r\n$/, "").split(",");
    expect(fields[addressIdx]).toBe("");
    expect(fields[latIdx]).toBe("");
    expect(fields[lngIdx]).toBe("");
    expect(line.toLowerCase()).not.toContain("null");
  });

  it("serializes populated address containing commas as a quoted CSV field", () => {
    const row = mapVehicleToRow({
      ...baseVehicle,
      address: "123 Main St, Springfield, IL 62701",
      latitude: 39.7817,
      longitude: -89.6501,
    });
    const line = serializeCSVRow(row, VEHICLE_CSV_HEADERS);
    // Address must be quoted due to embedded commas.
    expect(line).toContain('"123 Main St, Springfield, IL 62701"');
    // Latitude / longitude emitted as plain numeric tokens.
    expect(line).toContain("39.7817");
    expect(line).toContain("-89.6501");
  });
});

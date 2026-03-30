import { describe, it, expect } from "vitest";
import {
  mapFirecrawlToVehicle,
  parsePrice,
  parseMileage,
  normalizeStateOfVehicle,
} from "@/lib/vehicleMapper";

const TEST_DEALER_ID = "test-dealer-id";
const TEST_URL = "https://example.com/vdp/test-vehicle";

describe("mapFirecrawlToVehicle()", () => {
  it("strips dollar sign and commas from price", () => {
    const result = mapFirecrawlToVehicle(
      { price: "$38,900.00" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.price).toBe(38900);
  });

  it("strips whitespace from price", () => {
    const result = mapFirecrawlToVehicle(
      { price: " $24 500 " },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.price).toBe(24500);
  });

  it("strips 'mi' suffix from mileage", () => {
    const result = mapFirecrawlToVehicle(
      { mileage_value: "32,100 mi" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.mileageValue).toBe(32100);
  });

  it("strips 'km' suffix from mileage", () => {
    const result = mapFirecrawlToVehicle(
      { mileage_value: "50,000 km" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.mileageValue).toBe(50000);
  });

  it("normalizes 'Pre-Owned' state to 'Used'", () => {
    const result = mapFirecrawlToVehicle(
      { state_of_vehicle: "Pre-Owned" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.stateOfVehicle).toBe("Used");
  });

  it("normalizes 'CPO' state to 'Certified Used'", () => {
    const result = mapFirecrawlToVehicle(
      { state_of_vehicle: "CPO" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.stateOfVehicle).toBe("Certified Used");
  });

  it("detects missing required fields and marks vehicle as incomplete", () => {
    const result = mapFirecrawlToVehicle(
      {
        model: "Mustang",
        year: "2021",
        state_of_vehicle: "Used",
        mileage_value: "12,000 mi",
        // price and make are omitted
      },
      TEST_DEALER_ID,
      TEST_URL
    );

    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain("price");
    expect(result.missingFields).toContain("make");
  });

  it("emits 'state_of_vehicle' (not 'stateOfVehicle') in missingFields when state is absent", () => {
    const result = mapFirecrawlToVehicle(
      { make: "Ford", model: "Mustang", year: "2021", price: "$30,000" },
      TEST_DEALER_ID,
      TEST_URL
    );

    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain("state_of_vehicle");
    expect(result.missingFields).not.toContain("stateOfVehicle");
  });

  it("emits 'url' in missingFields when url is empty", () => {
    const result = mapFirecrawlToVehicle(
      { make: "Ford", model: "Mustang", year: "2021", price: "$30,000", state_of_vehicle: "Used" },
      TEST_DEALER_ID,
      ""
    );

    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain("url");
  });

  it("builds description fallback when no description is provided", () => {
    const result = mapFirecrawlToVehicle(
      {
        year: "2022",
        make: "Ford",
        model: "F-150",
        state_of_vehicle: "Used",
        mileage_value: "15,000 mi",
      },
      TEST_DEALER_ID,
      TEST_URL
    );

    expect(result.description).toBeTruthy();
    expect(result.description).toContain("2022");
    expect(result.description).toContain("Ford");
    expect(result.description).toContain("F-150");
  });

  it("returns isComplete true when all required fields are present", () => {
    const result = mapFirecrawlToVehicle(
      {
        price: "$25,000",
        make: "Toyota",
        model: "Camry",
        year: "2020",
        vin: "1HGCM82633A004352",
        state_of_vehicle: "Used",
        mileage_value: "30,000 mi",
      },
      TEST_DEALER_ID,
      TEST_URL
    );

    expect(result.isComplete).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });

  it("normalizes 'New' state correctly", () => {
    const result = mapFirecrawlToVehicle(
      { state_of_vehicle: "New" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.stateOfVehicle).toBe("New");
  });

  it("normalizes 'Brand New' state to 'New'", () => {
    const result = mapFirecrawlToVehicle(
      { state_of_vehicle: "Brand New" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.stateOfVehicle).toBe("New");
  });

  it("normalizes 'Certified Pre-Owned' state to 'Certified Used'", () => {
    const result = mapFirecrawlToVehicle(
      { state_of_vehicle: "Certified Pre-Owned" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.stateOfVehicle).toBe("Certified Used");
  });

  it("attaches dealerId and url to the result", () => {
    const result = mapFirecrawlToVehicle({}, TEST_DEALER_ID, TEST_URL);
    expect(result.dealerId).toBe(TEST_DEALER_ID);
    expect(result.url).toBe(TEST_URL);
    expect(result.id).toBeTruthy(); // UUID generated
  });

  it("generates a unique id on each call", () => {
    const r1 = mapFirecrawlToVehicle({}, TEST_DEALER_ID, TEST_URL);
    const r2 = mapFirecrawlToVehicle({}, TEST_DEALER_ID, TEST_URL);
    expect(r1.id).not.toBe(r2.id);
  });
});

describe("parsePrice()", () => {
  it("returns null for null/undefined/empty", () => {
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
    expect(parsePrice("")).toBeNull();
  });

  it("handles numeric input directly", () => {
    expect(parsePrice(24500)).toBe(24500);
  });

  it("strips $ and commas", () => {
    expect(parsePrice("$24,500")).toBe(24500);
    expect(parsePrice("$38,900.50")).toBe(38900.5);
  });

  it("returns null for unparseable strings", () => {
    expect(parsePrice("contact us")).toBeNull();
  });
});

describe("parseMileage()", () => {
  it("returns null for null/undefined/empty", () => {
    expect(parseMileage(null)).toBeNull();
    expect(parseMileage(undefined)).toBeNull();
    expect(parseMileage("")).toBeNull();
  });

  it("handles numeric input directly", () => {
    expect(parseMileage(18200)).toBe(18200);
  });

  it("strips commas and mi/km suffixes", () => {
    expect(parseMileage("18,200 mi")).toBe(18200);
    expect(parseMileage("50,000km")).toBe(50000);
  });
});

describe("normalizeStateOfVehicle()", () => {
  it("returns null for null/undefined/empty", () => {
    expect(normalizeStateOfVehicle(null)).toBeNull();
    expect(normalizeStateOfVehicle(undefined)).toBeNull();
    expect(normalizeStateOfVehicle("")).toBeNull();
  });

  it("normalizes all New variants", () => {
    expect(normalizeStateOfVehicle("New")).toBe("New");
    expect(normalizeStateOfVehicle("brand new")).toBe("New");
  });

  it("normalizes all Used variants", () => {
    expect(normalizeStateOfVehicle("used")).toBe("Used");
    expect(normalizeStateOfVehicle("Pre-Owned")).toBe("Used");
    expect(normalizeStateOfVehicle("pre owned")).toBe("Used");
  });

  it("normalizes all Certified Used variants", () => {
    expect(normalizeStateOfVehicle("CPO")).toBe("Certified Used");
    expect(normalizeStateOfVehicle("Certified Pre-Owned")).toBe("Certified Used");
    expect(normalizeStateOfVehicle("Certified Used")).toBe("Certified Used");
  });

  it("returns null for unrecognized values", () => {
    expect(normalizeStateOfVehicle("Lease Return")).toBeNull();
  });
});

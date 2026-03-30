import { describe, it, expect } from "vitest";
import {
  mapFirecrawlToVehicle,
  parsePrice,
  parseMileage,
  normalizeStateOfVehicle,
} from "@/lib/vehicleMapper";

const DEALER_ID = "dealer-001";
const URL = "https://example.com/vdp/test";

describe("mapFirecrawlToVehicle()", () => {
  it("strips $ and commas from price: '$24,500.00' → 24500", () => {
    const result = mapFirecrawlToVehicle({ price: "$24,500.00" }, DEALER_ID, URL);
    expect(result.price).toBe(24500);
  });

  it("strips whitespace from price: '$ 38 900' → 38900", () => {
    const result = mapFirecrawlToVehicle({ price: "$ 38 900" }, DEALER_ID, URL);
    expect(result.price).toBe(38900);
  });

  it("strips commas and 'mi' from mileage: '18,200 mi' → 18200", () => {
    const result = mapFirecrawlToVehicle({ mileage_value: "18,200 mi" }, DEALER_ID, URL);
    expect(result.mileageValue).toBe(18200);
  });

  it("strips commas and 'km' from mileage: '32,100km' → 32100", () => {
    const result = mapFirecrawlToVehicle({ mileage_value: "32,100km" }, DEALER_ID, URL);
    expect(result.mileageValue).toBe(32100);
  });

  it("normalizes 'Brand New' state to 'New'", () => {
    const result = mapFirecrawlToVehicle({ state_of_vehicle: "Brand New" }, DEALER_ID, URL);
    expect(result.stateOfVehicle).toBe("New");
  });

  it("normalizes 'Pre-Owned' state to 'Used'", () => {
    const result = mapFirecrawlToVehicle({ state_of_vehicle: "Pre-Owned" }, DEALER_ID, URL);
    expect(result.stateOfVehicle).toBe("Used");
  });

  it("normalizes 'Certified Pre-Owned' state to 'Certified Used'", () => {
    const result = mapFirecrawlToVehicle(
      { state_of_vehicle: "Certified Pre-Owned" },
      DEALER_ID,
      URL
    );
    expect(result.stateOfVehicle).toBe("Certified Used");
  });

  it("marks isComplete: false and includes 'make' in missingFields when make is null", () => {
    const result = mapFirecrawlToVehicle(
      { model: "Accord", year: "2022", price: "$30,000", state_of_vehicle: "New" },
      DEALER_ID,
      URL
    );
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain("make");
  });

  it("emits 'state_of_vehicle' (not 'stateOfVehicle') in missingFields when state is absent", () => {
    const result = mapFirecrawlToVehicle(
      { make: "Honda", model: "Accord", year: "2022", price: "$30,000" },
      DEALER_ID,
      URL
    );
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain("state_of_vehicle");
    expect(result.missingFields).not.toContain("stateOfVehicle");
  });

  it("emits 'url' in missingFields when url is empty", () => {
    const result = mapFirecrawlToVehicle(
      { make: "Honda", model: "Accord", year: "2022", price: "$30,000", state_of_vehicle: "New" },
      DEALER_ID,
      ""
    );
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain("url");
  });

  it("builds description fallback when no description provided", () => {
    const result = mapFirecrawlToVehicle(
      { year: "2021", make: "Ford", model: "Mustang", state_of_vehicle: "Used" },
      DEALER_ID,
      URL
    );
    expect(result.description).toContain("2021");
    expect(result.description).toContain("Ford");
    expect(result.description).toContain("Mustang");
  });

  it("returns isComplete: true and missingFields: [] when all required fields present", () => {
    const result = mapFirecrawlToVehicle(
      {
        make: "Toyota",
        model: "Camry",
        year: "2020",
        price: "$25,000",
        state_of_vehicle: "Used",
      },
      DEALER_ID,
      URL
    );
    expect(result.isComplete).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });
});

describe("parsePrice()", () => {
  it("returns null for null input", () => {
    expect(parsePrice(null)).toBeNull();
  });

  it("strips $ and commas", () => {
    expect(parsePrice("$24,500")).toBe(24500);
  });

  it("returns null for unparseable string", () => {
    expect(parsePrice("call for price")).toBeNull();
  });
});

describe("parseMileage()", () => {
  it("returns null for null input", () => {
    expect(parseMileage(null)).toBeNull();
  });

  it("strips commas and mi", () => {
    expect(parseMileage("18,200 mi")).toBe(18200);
  });

  it("strips km suffix", () => {
    expect(parseMileage("32,100km")).toBe(32100);
  });
});

describe("normalizeStateOfVehicle()", () => {
  it("normalizes 'New' → 'New'", () => {
    expect(normalizeStateOfVehicle("New")).toBe("New");
  });

  it("normalizes 'Brand New' → 'New'", () => {
    expect(normalizeStateOfVehicle("Brand New")).toBe("New");
  });

  it("normalizes 'Used' → 'Used'", () => {
    expect(normalizeStateOfVehicle("Used")).toBe("Used");
  });

  it("normalizes 'Pre Owned' → 'Used'", () => {
    expect(normalizeStateOfVehicle("Pre Owned")).toBe("Used");
  });

  it("normalizes 'CPO' → 'Certified Used'", () => {
    expect(normalizeStateOfVehicle("CPO")).toBe("Certified Used");
  });

  it("normalizes 'Certified Used' → 'Certified Used'", () => {
    expect(normalizeStateOfVehicle("Certified Used")).toBe("Certified Used");
  });

  it("returns null for unrecognized value", () => {
    expect(normalizeStateOfVehicle("Unknown")).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import {
  mapFirecrawlToVehicle,
  parsePrice,
  parseMileage,
  normalizeStateOfVehicle,
  normalizeBodyStyle,
  normalizeFuelType,
  normalizeTransmission,
  normalizeDrivetrain,
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
    expect(result.stateOfVehicle).toBe("USED");
  });

  it("normalizes 'CPO' state to 'CPO'", () => {
    const result = mapFirecrawlToVehicle(
      { state_of_vehicle: "CPO" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.stateOfVehicle).toBe("CPO");
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
    expect(result.stateOfVehicle).toBe("NEW");
  });

  it("normalizes 'Brand New' state to 'NEW'", () => {
    const result = mapFirecrawlToVehicle(
      { state_of_vehicle: "Brand New" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.stateOfVehicle).toBe("NEW");
  });

  it("normalizes 'Certified Pre-Owned' state to 'CPO'", () => {
    const result = mapFirecrawlToVehicle(
      { state_of_vehicle: "Certified Pre-Owned" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.stateOfVehicle).toBe("CPO");
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

  it("parses plain numeric latitude/longitude strings", () => {
    const result = mapFirecrawlToVehicle(
      { latitude: "37.7749", longitude: "-122.4194" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.latitude).toBeCloseTo(37.7749);
    expect(result.longitude).toBeCloseTo(-122.4194);
  });

  it("parses numeric latitude/longitude values directly", () => {
    const result = mapFirecrawlToVehicle(
      { latitude: 40.7128, longitude: -74.006 },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.latitude).toBe(40.7128);
    expect(result.longitude).toBe(-74.006);
  });

  it("parses map-prefixed coordinate strings (e.g. '@lat,lng')", () => {
    const result = mapFirecrawlToVehicle(
      { latitude: "@37.7749", longitude: "lng: -122.4194" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.latitude).toBeCloseTo(37.7749);
    expect(result.longitude).toBeCloseTo(-122.4194);
  });

  it("parses longitude correctly from combined '@lat,lng' pair string", () => {
    // Regression: when extraction returns a combined pair in the longitude
    // field, longitude must be the *second* token, not the first.
    const result = mapFirecrawlToVehicle(
      { latitude: "@37.7749,-122.4194", longitude: "@37.7749,-122.4194" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.latitude).toBeCloseTo(37.7749);
    expect(result.longitude).toBeCloseTo(-122.4194);
  });

  it("parses longitude second token from bare 'lat,lng' pair string", () => {
    const result = mapFirecrawlToVehicle(
      { latitude: "40.7128, -74.0060", longitude: "40.7128, -74.0060" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.latitude).toBeCloseTo(40.7128);
    expect(result.longitude).toBeCloseTo(-74.006);
  });

  it("returns null for out-of-range latitude/longitude values", () => {
    const r1 = mapFirecrawlToVehicle(
      { latitude: 95.5, longitude: -200.1 },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(r1.latitude).toBeNull();
    expect(r1.longitude).toBeNull();

    const r2 = mapFirecrawlToVehicle(
      { latitude: "-91.2", longitude: "181.0" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(r2.latitude).toBeNull();
    expect(r2.longitude).toBeNull();
  });

  it("parses embed URL fragment tokens like '!3d37.77'", () => {
    const result = mapFirecrawlToVehicle(
      { latitude: "!3d37.7749", longitude: "!4d-122.4194" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.latitude).toBeCloseTo(37.7749);
    expect(result.longitude).toBeCloseTo(-122.4194);
  });

  it("parses coordinate strings with degree symbol / directional suffix", () => {
    const result = mapFirecrawlToVehicle(
      { latitude: "37.7749° N", longitude: "-122.4194° W" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.latitude).toBeCloseTo(37.7749);
    expect(result.longitude).toBeCloseTo(-122.4194);
  });

  it("returns null for coordinate strings with no numeric content", () => {
    const result = mapFirecrawlToVehicle(
      { latitude: "not available", longitude: "see map" },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });

  it("returns null for null/undefined/empty coordinates", () => {
    const r1 = mapFirecrawlToVehicle(
      { latitude: null, longitude: undefined },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(r1.latitude).toBeNull();
    expect(r1.longitude).toBeNull();

    const r2 = mapFirecrawlToVehicle(
      { latitude: "", longitude: "   " },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(r2.latitude).toBeNull();
    expect(r2.longitude).toBeNull();
  });

  it("returns null for non-finite numeric coordinate values (NaN, Infinity)", () => {
    const r1 = mapFirecrawlToVehicle(
      { latitude: NaN, longitude: Infinity },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(r1.latitude).toBeNull();
    expect(r1.longitude).toBeNull();

    const r2 = mapFirecrawlToVehicle(
      { latitude: -Infinity, longitude: NaN },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(r2.latitude).toBeNull();
    expect(r2.longitude).toBeNull();
  });

  it("maps address string trimmed, and null for blank/missing", () => {
    const r1 = mapFirecrawlToVehicle(
      { address: "  123 Main St, Springfield  " },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(r1.address).toBe("123 Main St, Springfield");

    const r2 = mapFirecrawlToVehicle(
      { address: "   " },
      TEST_DEALER_ID,
      TEST_URL
    );
    expect(r2.address).toBeNull();

    const r3 = mapFirecrawlToVehicle({}, TEST_DEALER_ID, TEST_URL);
    expect(r3.address).toBeNull();
  });
});

describe("normalizeBodyStyle()", () => {
  it("maps common body styles to uppercase Meta enums", () => {
    expect(normalizeBodyStyle("sedan")).toBe("SEDAN");
    expect(normalizeBodyStyle("suv")).toBe("SUV");
    expect(normalizeBodyStyle("truck")).toBe("TRUCK");
    expect(normalizeBodyStyle("pickup")).toBe("PICKUP");
    expect(normalizeBodyStyle("coupe")).toBe("COUPE");
    expect(normalizeBodyStyle("convertible")).toBe("CONVERTIBLE");
    expect(normalizeBodyStyle("hatchback")).toBe("HATCHBACK");
    expect(normalizeBodyStyle("van")).toBe("VAN");
    expect(normalizeBodyStyle("minivan")).toBe("MINIVAN");
    expect(normalizeBodyStyle("wagon")).toBe("WAGON");
  });

  it("maps alias body styles correctly", () => {
    expect(normalizeBodyStyle("sport utility")).toBe("SUV");
    expect(normalizeBodyStyle("station wagon")).toBe("WAGON");
    expect(normalizeBodyStyle("sports car")).toBe("SPORTSCAR");
    expect(normalizeBodyStyle("grand tourer")).toBe("GRANDTOURER");
  });

  it("is case-insensitive", () => {
    expect(normalizeBodyStyle("SEDAN")).toBe("SEDAN");
    expect(normalizeBodyStyle("Sedan")).toBe("SEDAN");
  });

  it("returns OTHER for unrecognized non-empty values", () => {
    expect(normalizeBodyStyle("unknown style")).toBe("OTHER");
  });

  it("returns empty string for null, undefined, and empty string", () => {
    expect(normalizeBodyStyle(null)).toBe("");
    expect(normalizeBodyStyle(undefined)).toBe("");
    expect(normalizeBodyStyle("")).toBe("");
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
    expect(normalizeStateOfVehicle("New")).toBe("NEW");
    expect(normalizeStateOfVehicle("brand new")).toBe("NEW");
  });

  it("normalizes all Used variants", () => {
    expect(normalizeStateOfVehicle("used")).toBe("USED");
    expect(normalizeStateOfVehicle("Pre-Owned")).toBe("USED");
    expect(normalizeStateOfVehicle("pre owned")).toBe("USED");
  });

  it("normalizes all CPO variants", () => {
    expect(normalizeStateOfVehicle("CPO")).toBe("CPO");
    expect(normalizeStateOfVehicle("Certified Pre-Owned")).toBe("CPO");
    expect(normalizeStateOfVehicle("Certified Used")).toBe("CPO");
  });

  it("returns USED for unrecognized values", () => {
    expect(normalizeStateOfVehicle("Lease Return")).toBe("USED");
  });
});

describe("normalizeFuelType()", () => {
  it("maps known fuel types to Meta enums", () => {
    expect(normalizeFuelType("gasoline")).toBe("GASOLINE");
    expect(normalizeFuelType("gas")).toBe("GASOLINE");
    expect(normalizeFuelType("diesel")).toBe("DIESEL");
    expect(normalizeFuelType("electric")).toBe("ELECTRIC");
    expect(normalizeFuelType("hybrid")).toBe("HYBRID");
    expect(normalizeFuelType("phev")).toBe("PLUGIN_HYBRID");
    expect(normalizeFuelType("flex")).toBe("FLEX");
    expect(normalizeFuelType("petrol")).toBe("PETROL");
  });

  it("is case-insensitive", () => {
    expect(normalizeFuelType("GASOLINE")).toBe("GASOLINE");
    expect(normalizeFuelType("Diesel")).toBe("DIESEL");
  });

  it("returns OTHER for unrecognized values", () => {
    expect(normalizeFuelType("hydrogen")).toBe("OTHER");
  });

  it("returns empty string for null, undefined, and empty string", () => {
    expect(normalizeFuelType(null)).toBe("");
    expect(normalizeFuelType(undefined)).toBe("");
    expect(normalizeFuelType("")).toBe("");
  });
});

describe("normalizeTransmission()", () => {
  it("maps known transmission types to Meta enums", () => {
    expect(normalizeTransmission("automatic")).toBe("AUTOMATIC");
    expect(normalizeTransmission("cvt")).toBe("AUTOMATIC");
    expect(normalizeTransmission("manual")).toBe("MANUAL");
    expect(normalizeTransmission("stick")).toBe("MANUAL");
  });

  it("is case-insensitive", () => {
    expect(normalizeTransmission("Auto")).toBe("AUTOMATIC");
  });

  it("returns OTHER for unrecognized values", () => {
    expect(normalizeTransmission("sequential")).toBe("OTHER");
  });

  it("returns empty string for null, undefined, and empty string", () => {
    expect(normalizeTransmission(null)).toBe("");
    expect(normalizeTransmission(undefined)).toBe("");
    expect(normalizeTransmission("")).toBe("");
  });
});

describe("normalizeDrivetrain()", () => {
  it("maps known drivetrain types to Meta enums", () => {
    expect(normalizeDrivetrain("fwd")).toBe("FWD");
    expect(normalizeDrivetrain("rwd")).toBe("RWD");
    expect(normalizeDrivetrain("awd")).toBe("AWD");
    expect(normalizeDrivetrain("4wd")).toBe("4X4");
    expect(normalizeDrivetrain("4x4")).toBe("4X4");
    expect(normalizeDrivetrain("4x2")).toBe("4X2");
    expect(normalizeDrivetrain("2wd")).toBe("4X2");
    expect(normalizeDrivetrain("front wheel drive")).toBe("FWD");
  });

  it("is case-insensitive", () => {
    expect(normalizeDrivetrain("AWD")).toBe("AWD");
  });

  it("returns OTHER for unrecognized values", () => {
    expect(normalizeDrivetrain("unknown")).toBe("OTHER");
  });

  it("returns empty string for null, undefined, and empty string", () => {
    expect(normalizeDrivetrain(null)).toBe("");
    expect(normalizeDrivetrain(undefined)).toBe("");
    expect(normalizeDrivetrain("")).toBe("");
  });
});

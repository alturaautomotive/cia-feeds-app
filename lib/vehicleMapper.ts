export interface FirecrawlRawVehicle {
  vin?: string | null;
  make?: string | null;
  model?: string | null;
  year?: string | number | null;
  body_style?: string | null;
  price?: string | number | null;
  mileage_value?: string | number | null;
  state_of_vehicle?: string | null;
  exterior_color?: string | null;
  trim?: string | null;
  drivetrain?: string | null;
  transmission?: string | null;
  fuel_type?: string | null;
  msrp?: string | number | null;
  image_url?: string | null;
  image_url_2?: string | null;
  description?: string | null;
  address?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

export interface MappedVehicle {
  id: string;
  dealerId: string;
  url: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: string | null;
  bodyStyle: string | null;
  price: number | null;
  mileageValue: number | null;
  stateOfVehicle: string | null;
  exteriorColor: string | null;
  trim: string | null;
  drivetrain: string | null;
  transmission: string | null;
  fuelType: string | null;
  msrp: number | null;
  imageUrl: string | null;
  description: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isComplete: boolean;
  missingFields: string[];
}

/**
 * Strip $, commas, and whitespace from a price string; parse as float.
 */
export function parsePrice(
  raw: string | number | null | undefined
): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return isNaN(raw) ? null : raw;
  const cleaned = String(raw).replace(/[$,\s]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Strip commas, mi, km, and whitespace from a mileage string; parse as float.
 */
export function parseMileage(
  raw: string | number | null | undefined
): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return isNaN(raw) ? null : raw;
  const cleaned = String(raw).replace(/[,\s]|mi|km/gi, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Normalize state_of_vehicle to "NEW" | "USED" | "CPO".
 * Returns "USED" as fallback for unrecognized values; null for empty/null.
 */
export function normalizeStateOfVehicle(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower === "new" || lower === "brand new") return "NEW";
  if (lower === "used" || lower === "pre-owned" || lower === "pre owned" || lower === "pre-driven" || lower === "preowned" || lower === "like new")
    return "USED";
  if (
    lower === "certified pre-owned" ||
    lower === "certified pre owned" ||
    lower === "cpo" ||
    lower === "certified used"
  )
    return "CPO";
  console.log({ event: 'state_of_vehicle_fallback', raw, defaultedTo: 'USED' });
  return "USED";
}

const BODY_STYLE_MAP: Record<string, string> = {
  sedan: "SEDAN",
  saloon: "SEDAN",
  suv: "SUV",
  "sport utility": "SUV",
  "sport utility vehicle": "SUV",
  truck: "TRUCK",
  "pickup truck": "TRUCK",
  pickup: "PICKUP",
  coupe: "COUPE",
  coupé: "COUPE",
  convertible: "CONVERTIBLE",
  hatchback: "HATCHBACK",
  hatch: "HATCHBACK",
  wagon: "WAGON",
  estate: "WAGON",
  "station wagon": "WAGON",
  van: "VAN",
  minivan: "MINIVAN",
  "mini van": "MINIVAN",
  crossover: "CROSSOVER",
  roadster: "ROADSTER",
  mpv: "MPV",
  minibus: "MINIBUS",
  "mini bus": "MINIBUS",
  sportscar: "SPORTSCAR",
  "sports car": "SPORTSCAR",
  supercar: "SUPERCAR",
  "super car": "SUPERCAR",
  supermini: "SUPERMINI",
  "super mini": "SUPERMINI",
  grandtourer: "GRANDTOURER",
  "grand tourer": "GRANDTOURER",
  gt: "GRANDTOURER",
  "small car": "SMALL_CAR",
  small_car: "SMALL_CAR",
};

const VALID_BODY_STYLES = new Set(Object.values(BODY_STYLE_MAP));

/**
 * Normalize body_style to Meta's uppercase enum values.
 * Returns "" for null/undefined/empty or unrecognized values.
 */
export function normalizeBodyStyle(raw: string | null | undefined): string {
  if (!raw) return "";
  const lower = raw.toLowerCase().trim();
  if (!lower) return "";
  const mapped = BODY_STYLE_MAP[lower];
  if (mapped) return mapped;
  const upper = raw.toUpperCase().trim();
  if (VALID_BODY_STYLES.has(upper)) return upper;
  return "";
}

// ── Fuel Type normalization ──────────────────────────────────────────
const FUEL_TYPE_MAP: Record<string, string> = {
  gasoline: "GASOLINE",
  gas: "GASOLINE",
  unleaded: "GASOLINE",
  regular: "GASOLINE",
  diesel: "DIESEL",
  electric: "ELECTRIC",
  ev: "ELECTRIC",
  bev: "ELECTRIC",
  hybrid: "HYBRID",
  "plugin hybrid": "PLUGIN_HYBRID",
  "plug-in hybrid": "PLUGIN_HYBRID",
  phev: "PLUGIN_HYBRID",
  plugin_hybrid: "PLUGIN_HYBRID",
  flex: "FLEX",
  "flex fuel": "FLEX",
  "flex-fuel": "FLEX",
  e85: "FLEX",
  petrol: "PETROL",
};

export function normalizeFuelType(raw: string | null | undefined): string {
  if (!raw) return "";
  const lower = raw.toLowerCase().trim();
  if (!lower) return "";
  const mapped = FUEL_TYPE_MAP[lower];
  if (mapped) return mapped;
  return "";
}

// ── Transmission normalization ──────────────────────────────────────
const TRANSMISSION_MAP: Record<string, string> = {
  automatic: "AUTOMATIC",
  auto: "AUTOMATIC",
  cvt: "AUTOMATIC",
  "continuously variable": "AUTOMATIC",
  dct: "AUTOMATIC",
  "dual-clutch": "AUTOMATIC",
  "dual clutch": "AUTOMATIC",
  tiptronic: "AUTOMATIC",
  manual: "MANUAL",
  stick: "MANUAL",
  "stick shift": "MANUAL",
  mt: "MANUAL",
  standard: "MANUAL",
};

export function normalizeTransmission(raw: string | null | undefined): string {
  if (!raw) return "";
  const lower = raw.toLowerCase().trim();
  if (!lower) return "";
  const mapped = TRANSMISSION_MAP[lower];
  if (mapped) return mapped;
  return "";
}

// ── Drivetrain normalization ────────────────────────────────────────
const DRIVETRAIN_MAP: Record<string, string> = {
  fwd: "FWD",
  "front wheel drive": "FWD",
  "front-wheel drive": "FWD",
  "2wd": "4X2",
  rwd: "RWD",
  "rear wheel drive": "RWD",
  "rear-wheel drive": "RWD",
  awd: "AWD",
  "all wheel drive": "AWD",
  "all-wheel drive": "AWD",
  "4x4": "4X4",
  "4wd": "4X4",
  "four wheel drive": "4X4",
  "four-wheel drive": "4X4",
  "4x4/4wd": "4X4",
  "4x2": "4X2",
};

const VALID_DRIVETRAINS = new Set(Object.values(DRIVETRAIN_MAP));

export function normalizeDrivetrain(raw: string | null | undefined): string {
  if (!raw) return "";
  const lower = raw.toLowerCase().trim();
  if (!lower) return "";
  const mapped = DRIVETRAIN_MAP[lower];
  if (mapped) return mapped;
  const upper = raw.toUpperCase().trim();
  if (VALID_DRIVETRAINS.has(upper)) return upper;
  return "";
}

/**
 * Pure function: maps raw Firecrawl JSON to the application Vehicle schema.
 *
 * @param raw - Raw data from Firecrawl extraction (null/undefined handled)
 * @param dealerId - The authenticated dealer's ID
 * @param url - The VDP URL being scraped
 */
export function mapFirecrawlToVehicle(
  raw: FirecrawlRawVehicle | null | undefined,
  dealerId: string,
  url: string
): MappedVehicle {
  const id = crypto.randomUUID();
  const make = raw?.make?.trim() || null;
  const model = raw?.model?.trim() || null;
  const rawYear = raw?.year;
  const year: string | null = rawYear != null && rawYear !== ""
    ? (() => { const n = parseInt(String(rawYear), 10); return isNaN(n) ? null : String(n); })()
    : null;
  const price = parsePrice(raw?.price);
  const msrp = parsePrice(raw?.msrp);
  const mileageValue = parseMileage(raw?.mileage_value);
  const stateOfVehicle = normalizeStateOfVehicle(raw?.state_of_vehicle);
  const trim = raw?.trim?.trim() || null;
  const drivetrain = raw?.drivetrain?.trim() || null;
  const transmission = raw?.transmission?.trim() || null;
  const fuelType = raw?.fuel_type?.trim() || null;

  const address = typeof raw?.address === "string" && raw.address.trim() !== ""
    ? raw.address.trim()
    : null;
  // Extract all signed numeric tokens from a raw coord value. Prefers tokens
  // with a decimal point (coordinates almost always have one), which handles
  // embed URL fragments like "!3d37.7749" where a short integer token precedes
  // the real coordinate. Falls back to signed integers for whole-degree cases.
  // Returns multiple tokens when the input is a combined pair string such as
  // "@37.7749,-122.4194" so that latitude/longitude can be disambiguated.
  const extractCoordTokens = (
    v: string | number | null | undefined
  ): number[] => {
    if (v === null || v === undefined || v === "") return [];
    if (typeof v === "number") return Number.isFinite(v) ? [v] : [];
    const str = String(v).trim();
    if (str === "") return [];
    const decimals = str.match(/-?\d+\.\d+/g);
    if (decimals && decimals.length > 0) {
      return decimals.map(parseFloat).filter((n) => Number.isFinite(n));
    }
    const ints = str.match(/-?\d+/g);
    if (ints && ints.length > 0) {
      return ints.map(parseFloat).filter((n) => Number.isFinite(n));
    }
    return [];
  };
  const parseLatitude = (
    v: string | number | null | undefined
  ): number | null => {
    const tokens = extractCoordTokens(v);
    if (tokens.length === 0) return null;
    // Latitude is the first token, including when the field contains a
    // combined "@lat,lng" pair string.
    const n = tokens[0];
    return n >= -90 && n <= 90 ? n : null;
  };
  const parseLongitude = (
    v: string | number | null | undefined
  ): number | null => {
    const tokens = extractCoordTokens(v);
    if (tokens.length === 0) return null;
    // When the longitude field received a combined "@lat,lng" pair, the
    // longitude is the second token. Otherwise use the single extracted token.
    const n = tokens.length >= 2 ? tokens[1] : tokens[0];
    return n >= -180 && n <= 180 ? n : null;
  };
  const latitude = parseLatitude(raw?.latitude);
  const longitude = parseLongitude(raw?.longitude);

  const descriptionFallback =
    year && make && model && stateOfVehicle
      ? `${year} ${make} ${model} — ${stateOfVehicle}, ${mileageValue ?? 0} miles`
      : "Vehicle details unavailable";

  const description = raw?.description || descriptionFallback;

  const missingFields: string[] = [];
  if (!make) missingFields.push("make");
  if (!model) missingFields.push("model");
  if (!year) missingFields.push("year");
  if (price === null) missingFields.push("price");
  if (!stateOfVehicle) missingFields.push("state_of_vehicle");
  if (!url) missingFields.push("url");

  const isComplete = missingFields.length === 0;

  return {
    id,
    dealerId,
    url,
    vin: raw?.vin ?? null,
    make,
    model,
    year,
    bodyStyle: raw?.body_style ?? null,
    price,
    mileageValue,
    stateOfVehicle,
    exteriorColor: raw?.exterior_color ?? null,
    trim,
    drivetrain,
    transmission,
    fuelType,
    msrp,
    imageUrl: raw?.image_url_2 ?? raw?.image_url ?? null,
    description,
    address,
    latitude,
    longitude,
    isComplete,
    missingFields,
  };
}

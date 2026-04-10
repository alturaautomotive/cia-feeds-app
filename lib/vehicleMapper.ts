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
 * Normalize state_of_vehicle to "New" | "Used" | "Certified Used".
 * Returns the original string for unrecognized values; null for empty/null.
 */
export function normalizeStateOfVehicle(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower === "new" || lower === "brand new") return "New";
  if (lower === "used" || lower === "pre-owned" || lower === "pre owned")
    return "Used";
  if (
    lower === "certified pre-owned" ||
    lower === "certified pre owned" ||
    lower === "cpo" ||
    lower === "certified used"
  )
    return "Certified Used";
  return null;
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
  const mileageValue = parseMileage(raw?.mileage_value);
  const stateOfVehicle = normalizeStateOfVehicle(raw?.state_of_vehicle);

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
    imageUrl: raw?.image_url_2 ?? raw?.image_url ?? null,
    description,
    address,
    latitude,
    longitude,
    isComplete,
    missingFields,
  };
}

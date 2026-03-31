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
    isComplete,
    missingFields,
  };
}

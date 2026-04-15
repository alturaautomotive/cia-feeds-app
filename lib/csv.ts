import { normalizeBodyStyle, normalizeStateOfVehicle, normalizeFuelType, normalizeTransmission, normalizeDrivetrain } from "@/lib/vehicleMapper";

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function serializeCSVHeader(headers: string[]): string {
  return headers.join(",") + "\r\n";
}

export function serializeCSVRow(row: Record<string, unknown>, headers: string[]): string {
  return headers.map((h) => escapeField(row[h])).join(",") + "\r\n";
}

export function serializeCSV(rows: Record<string, unknown>[], headers: string[]): string {
  return serializeCSVHeader(headers) + rows.map((row) => serializeCSVRow(row, headers)).join("");
}

// --- Vertical-specific CSV headers ---

export const SERVICES_CSV_HEADERS = [
  "id", "name", "description", "price", "category", "address", "url", "image_url", "availability", "brand", "condition", "fb_product_category",
];

export const ECOMMERCE_CSV_HEADERS = [
  "id", "title", "description", "price", "brand", "condition", "availability",
  "retailer_id", "link", "image", "google_product_category",
];

export const REALESTATE_CSV_HEADERS = [
  "id", "name", "description", "price", "address", "city", "region",
  "postal_code", "num_beds", "num_baths", "property_type", "url", "image_url", "area_size",
];

export function mapListingToRow(listing: {
  id: string;
  title: string;
  price: number | null;
  imageUrls: string[];
  url: string | null;
  data: Record<string, unknown>;
}): Record<string, unknown> {
  const d = listing.data;
  return {
    id: listing.id,
    // Spread raw data first so canonical fields below always win
    ...d,
    // Canonical fields — prefer listing model values, fall back to data, then empty
    title: listing.title || d.title || "",
    name: listing.title || d.name || "",
    description: d.description || "",
    price: listing.price != null ? String(listing.price) : (d.price ? String(d.price) : ""),
    url: listing.url || d.url || "",
    image_url: listing.imageUrls[0] ?? "",
    link: listing.url || d.link || "",
    image: listing.imageUrls[0] ?? "",
  };
}

export function serializeEcommerceRow(listing: {
  id: string;
  title: string;
  price: number | null;
  imageUrls: string[];
  url: string | null;
  data: Record<string, unknown>;
}): string {
  const row = mapListingToRow(listing);
  return serializeCSVRow(row, ECOMMERCE_CSV_HEADERS);
}

export function serializeServicesRow(listing: {
  id: string;
  title: string;
  price: number | null;
  imageUrls: string[];
  url: string | null;
  data: Record<string, unknown>;
}): Record<string, unknown> {
  const row = mapListingToRow(listing);
  // Services verticals prefer raw price text (e.g. "Starting at $50/hr") over normalized numeric price
  if (listing.data.price) {
    row.price = String(listing.data.price);
  }
  // Ensure address is explicitly mapped for Meta's local_service_businesses spec
  row.address = listing.data.address || row.address || "";
  row.availability = "available for order";
  row.fb_product_category = "Professional Services";
  row.brand = listing.data.brand ? String(listing.data.brand) : "";
  row.condition = listing.data.condition ? String(listing.data.condition) : "";
  return row;
}

export function serializeRealEstateRow(listing: {
  id: string;
  title: string;
  price: number | null;
  imageUrls: string[];
  url: string | null;
  data: Record<string, unknown>;
}): string {
  const row = mapListingToRow(listing);
  return serializeCSVRow(row, REALESTATE_CSV_HEADERS);
}

export const VEHICLE_CSV_HEADERS = [
  "vin",
  "state_of_vehicle",
  "year",
  "make",
  "model",
  "trim",
  "drivetrain",
  "transmission",
  "exterior_color",
  "price",
  "msrp",
  "mileage.value",
  "fuel_type",
  "latitude",
  "longitude",
  "body_style",
  "url",
  "title",
  "vehicle_id",
  "mileage.unit",
  "street_address",
  "city",
  "region",
  "postal_code",
  "country",
  "image[0].url",
  "image[1].url",
  "fb_page_id",
  "description",
];

export type VehicleForCSV = {
  id: string;
  description: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: string | null;
  bodyStyle: string | null;
  price: number | null;
  mileageValue: number | null;
  stateOfVehicle: string | null;
  exteriorColor: string | null;
  trim?: string | null;
  drivetrain?: string | null;
  transmission?: string | null;
  fuelType?: string | null;
  msrp?: number | null;
  url: string;
  imageUrl: string | null;
  images: string[];
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  dealer?: {
    name: string;
    fbPageId?: string | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
};

function normalizeImageUrl(img: string): string {
  if (img.startsWith("https://") || img.startsWith("http://")) return img;
  if (img.startsWith("//")) return `https:${img}`;
  if (img.startsWith("/")) return `https://www.ciafeed.com${img}`;
  return `https://www.ciafeed.com/${img}`;
}

function selectBestImages(imageUrl: string | null, images: string[]): string[] {
  const candidates = [...new Set([imageUrl, ...images].filter((u): u is string => !!u))];
  const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

  const withExt: string[] = [];
  const withoutExt: string[] = [];

  for (const candidate of candidates) {
    const pathname = candidate.split('?')[0].toLowerCase();
    if (validExtensions.some((ext) => pathname.endsWith(ext))) {
      withExt.push(candidate);
    } else {
      withoutExt.push(candidate);
    }
  }

  return [...withExt, ...withoutExt].map(normalizeImageUrl);
}

function parseStateZip(segment: string): { region?: string; postal_code?: string } {
  const tokens = segment.split(/\s+/);
  const out: { region?: string; postal_code?: string } = {};
  if (tokens[0]) out.region = tokens[0];
  if (tokens[1] && /^\d{5}(-\d{4})?$/.test(tokens[1])) out.postal_code = tokens[1];
  return out;
}

function parseAddressFields(raw: string): { street_address: string; city: string; region: string; postal_code: string; country: string } {
  if (!raw) return { street_address: "", city: "", region: "", postal_code: "", country: "US" };
  const parts = raw.split(",").map((p) => p.trim());

  if (parts.length >= 3) {
    const stateZip = parseStateZip(parts[parts.length - 1]);
    return {
      street_address: parts.slice(0, parts.length - 2).join(", "),
      city: parts[parts.length - 2],
      region: stateZip.region ?? "",
      postal_code: stateZip.postal_code ?? "",
      country: "US",
    };
  } else if (parts.length === 2) {
    const stateZip = parseStateZip(parts[1]);
    return {
      street_address: "",
      city: parts[0],
      region: stateZip.region ?? "",
      postal_code: stateZip.postal_code ?? "",
      country: "US",
    };
  } else {
    return { street_address: raw, city: "", region: "", postal_code: "", country: "US" };
  }
}

export function mapVehicleToRow(v: VehicleForCSV): Record<string, unknown> {
  const imgs = selectBestImages(v.imageUrl, v.images);

  const stateRaw = normalizeStateOfVehicle(v.stateOfVehicle);
  let stateOfVehicle = "";
  if (stateRaw === "NEW") stateOfVehicle = "New";
  else if (stateRaw === "USED") stateOfVehicle = "Used";
  else if (stateRaw === "CPO") stateOfVehicle = "CPO";

  return {
    vin: (v.vin ?? "").toUpperCase(),
    state_of_vehicle: stateOfVehicle,
    year: v.year ?? "",
    make: v.make ?? "",
    model: v.model ?? "",
    trim: v.trim ?? "",
    drivetrain: normalizeDrivetrain(v.drivetrain),
    transmission: normalizeTransmission(v.transmission),
    exterior_color: v.exteriorColor ?? "",
    price: v.price != null ? `${v.price} USD` : "",
    msrp: v.msrp != null ? `${v.msrp} USD` : "",
    "mileage.value": String(v.mileageValue ?? ""),
    fuel_type: normalizeFuelType(v.fuelType),
    latitude: String(v.latitude ?? v.dealer?.latitude ?? ""),
    longitude: String(v.longitude ?? v.dealer?.longitude ?? ""),
    body_style: normalizeBodyStyle(v.bodyStyle),
    url: v.url || "",
    title: `${v.make ?? ""} ${v.model ?? ""}`.trim(),
    vehicle_id: v.id,
    "mileage.unit": "MI",
    ...parseAddressFields(v.address || v.dealer?.address || ""),
    "image[0].url": imgs[0] ?? "",
    "image[1].url": imgs[1] ?? "",
    fb_page_id: v.dealer?.fbPageId ?? "",
    description: v.description ?? "",
  };
}


export function getCSVHeadersForVertical(vertical: string): string[] {
  switch (vertical) {
    case "services": return SERVICES_CSV_HEADERS;
    case "ecommerce": return ECOMMERCE_CSV_HEADERS;
    case "realestate": return REALESTATE_CSV_HEADERS;
    default: return [];
  }
}

import { normalizeBodyStyle, normalizeStateOfVehicle } from "@/lib/vehicleMapper";

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
  "id",
  "title",
  "description",
  "link",
  "image_link",
  "availability",
  "condition",
  "vehicle_id",
  "vin",
  "make",
  "model",
  "year",
  "state_of_vehicle",
  "mileage.value",
  "mileage.unit",
  "body_style",
  "address",
  "latitude",
  "longitude",
  "exterior_color",
  "fuel_type",
  "transmission",
  "drivetrain",
  "trim",
  "price",
  "msrp",
  "fb_page_id",
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

export function mapVehicleToRow(v: VehicleForCSV): Record<string, unknown> {
  const resolvedLat = v.latitude ?? v.dealer?.latitude ?? null;
  const resolvedLng = v.longitude ?? v.dealer?.longitude ?? null;
  const resolvedAddress = v.address ?? v.dealer?.address ?? "";
  return {
    id: v.id,
    title: `${v.make ?? ""} ${v.model ?? ""}`.trim(),
    description: v.description ?? "",
    link: v.url,
    image_link: v.imageUrl ?? v.images[0] ?? "",
    availability: "in stock",
    condition: (() => {
      const state = normalizeStateOfVehicle(v.stateOfVehicle);
      if (state === "NEW") return "new";
      if (state === "USED" || state === "CPO") return "used";
      return "used";
    })(),
    vehicle_id: v.id,
    vin: (v.vin ?? "").toUpperCase(),
    make: v.make ?? "",
    model: v.model ?? "",
    year: v.year ?? "",
    state_of_vehicle: normalizeStateOfVehicle(v.stateOfVehicle) ?? "",
    "mileage.value": String(v.mileageValue ?? ""),
    "mileage.unit": "MI",
    body_style: normalizeBodyStyle(v.bodyStyle),
    address: resolvedAddress,
    latitude: resolvedLat != null ? String(resolvedLat) : "",
    longitude: resolvedLng != null ? String(resolvedLng) : "",
    exterior_color: v.exteriorColor ?? "",
    fuel_type: v.fuelType ?? "",
    transmission: v.transmission ?? "",
    drivetrain: v.drivetrain ?? "",
    trim: v.trim ?? "",
    price: String(v.price ?? ""),
    msrp: v.msrp != null ? String(v.msrp) : "",
    fb_page_id: v.dealer?.fbPageId ?? "",
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

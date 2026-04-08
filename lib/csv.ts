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
  "id", "name", "description", "price", "category", "address", "url", "image_url", "availability",
];

export const ECOMMERCE_CSV_HEADERS = [
  "id", "title", "description", "price", "brand", "condition", "availability",
  "retailer_id", "link", "image_link", "google_product_category",
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
    image_link: listing.imageUrls[0] ?? "",
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
  "dealer_name",
  "vin",
  "year",
  "make",
  "model",
  "body_style",
  "transmission",
  "trim",
  "mileage.value",
  "drivetrain",
  "exterior_color",
  "msrp",
  "price",
  "description",
  "image[0].url",
  "image[1].url",
  "image[2].url",
  "image[3].url",
  "image[4].url",
  "image[5].url",
  "image[6].url",
  "fuel_type",
  "address",
  "state_of_vehicle",
  "title",
  "url",
  "latitude",
  "longitude",
  "vehicle_id",
  "mileage.unit",
  "days_on_lot",
  "fb_page_id",
];

export function mapVehicleToRow(v: {
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
  url: string;
  imageUrl: string | null;
  images: string[];
  dealer?: { name: string } | null;
}): Record<string, unknown> {
  return {
    dealer_name: v.dealer?.name ?? "",
    vin: v.vin ?? "",
    year: v.year ?? "",
    make: v.make ?? "",
    model: v.model ?? "",
    body_style: v.bodyStyle ?? "",
    transmission: "",
    trim: "",
    "mileage.value": String(v.mileageValue ?? ""),
    drivetrain: "",
    exterior_color: v.exteriorColor ?? "",
    msrp: "",
    price: String(v.price ?? ""),
    description: v.description ?? "",
    "image[0].url": v.images[0] ?? "",
    "image[1].url": v.images[1] ?? "",
    "image[2].url": v.images[2] ?? "",
    "image[3].url": v.images[3] ?? "",
    "image[4].url": v.images[4] ?? "",
    "image[5].url": v.images[5] ?? "",
    "image[6].url": v.images[6] ?? "",
    fuel_type: "",
    address: "",
    state_of_vehicle: v.stateOfVehicle ?? "",
    title: `${v.make ?? ""} ${v.model ?? ""}`.trim(),
    url: v.url,
    latitude: "",
    longitude: "",
    vehicle_id: v.id,
    "mileage.unit": "mi",
    days_on_lot: "",
    fb_page_id: "",
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

import {
  normalizeBodyStyle,
  normalizeStateOfVehicle,
  normalizeFuelType,
  normalizeTransmission,
  normalizeDrivetrain,
  inferBodyStyleFromModel,
  inferDrivetrainFromContext,
  inferFuelTypeFromContext,
} from "@/lib/vehicleMapper";

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
  "id", "title", "description", "price", "link", "image_link", "availability", "brand", "condition", "google_product_category", "fb_product_category", "address",
];

export const ECOMMERCE_CSV_HEADERS = [
  "id", "title", "description", "price", "brand", "condition", "availability",
  "retailer_id", "link", "image", "google_product_category",
];

export const REALESTATE_CSV_HEADERS = [
  "id", "name", "description", "price", "address", "city", "region",
  "postal_code", "num_beds", "num_baths", "property_type", "url", "image_url", "area_size",
];

export type FeedUrlOpts = { feedUrlMode?: string; slug?: string; appBaseUrl?: string };

function resolveFeedUrl(originalUrl: string, itemId: string, opts?: FeedUrlOpts): string {
  if (opts?.feedUrlMode === "landing" && opts.slug && opts.appBaseUrl) {
    return `${opts.appBaseUrl.replace(/\/+$/, "")}/w/${opts.slug}/${itemId}`;
  }
  return originalUrl;
}

export function mapListingToRow(listing: {
  id: string;
  title: string;
  price: number | null;
  imageUrls: string[];
  url: string | null;
  data: Record<string, unknown>;
}, opts?: FeedUrlOpts): Record<string, unknown> {
  const d = listing.data;
  const originalUrl = listing.url || (typeof d.url === "string" ? d.url : "") || "";
  const urlForRow = resolveFeedUrl(originalUrl, listing.id, opts);
  return {
    id: listing.id,
    // Spread raw data first so canonical fields below always win
    ...d,
    // Canonical fields — prefer listing model values, fall back to data, then empty
    title: listing.title || d.title || "",
    name: listing.title || d.name || "",
    description: d.description || "",
    price: listing.price != null ? String(listing.price) : (d.price ? String(d.price) : ""),
    url: urlForRow,
    image_url: listing.imageUrls[0] ?? "",
    link: urlForRow,
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

const ALLOWED_AVAILABILITY = new Set(["in stock", "out of stock", "available for order", "discontinued"]);

export function serializeServicesRow(listing: {
  id: string;
  title: string;
  price: number | null;
  imageUrls: string[];
  url: string | null;
  data: Record<string, unknown>;
}, opts?: FeedUrlOpts): Record<string, unknown> {
  const d = listing.data;

  // Title resolution: listing.title → data.name → data.title → "Service"
  const title = listing.title || (typeof d.name === "string" ? d.name : "") || (typeof d.title === "string" ? d.title : "") || "Service";

  // Link resolution: listing.url → data.url → ""
  const originalLink = listing.url || (typeof d.url === "string" ? d.url : "") || "";
  const link = resolveFeedUrl(originalLink, listing.id, opts);

  // Image link: listing.imageUrls[0] → ""
  const image_link = listing.imageUrls[0] ?? "";

  // Price: prefer raw string from data.price, else format numeric, else "0 USD"
  let price: string;
  if (typeof d.price === "string" && d.price !== "") {
    price = d.price;
  } else if (listing.price != null) {
    price = `${listing.price} USD`;
  } else {
    price = "0 USD";
  }

  // Availability normalization
  const rawAvailability = typeof d.availability === "string" ? d.availability.toLowerCase() : "";
  const availability = ALLOWED_AVAILABILITY.has(rawAvailability) ? rawAvailability : "in stock";

  return {
    id: listing.id,
    title,
    description: (typeof d.description === 'string' ? d.description : '') || title,
    price,
    link,
    image_link,
    availability,
    brand: d.brand ? String(d.brand) : "",
    condition: d.condition ? String(d.condition) : "new",
    google_product_category: d.google_product_category ? String(d.google_product_category) : "888",
    fb_product_category: d.fb_product_category ? String(d.fb_product_category) : "Professional Services",
    address: typeof d.address === 'string' ? d.address : '',
  };
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
  "address",
  "image[0].url",
  "image[1].url",
  "fb_page_id",
  "description",
  "availability",
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
  archivedAt: Date | null;
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
    const looksLikeStreet = /^\d/.test(parts[0].trim());
    return {
      street_address: looksLikeStreet ? parts[0] : "",
      city: looksLikeStreet ? "" : parts[0],
      region: stateZip.region ?? "",
      postal_code: stateZip.postal_code ?? "",
      country: "US",
    };
  } else {
    return { street_address: raw, city: "", region: "", postal_code: "", country: "US" };
  }
}

function formatAddressAsJSON(fields: {
  street_address: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
}): string {
  return JSON.stringify({
    addr1: fields.street_address,
    city: fields.city,
    region: fields.region,
    country: fields.country,
    postal_code: fields.postal_code,
  });
}

export function mapVehicleToRow(v: VehicleForCSV, opts?: FeedUrlOpts): Record<string, unknown> {
  const imgs = selectBestImages(v.imageUrl, v.images);

  // 1. Resolve stateOfVehicle (always non-empty thanks to USED fallback)
  const stateOfVehicle = normalizeStateOfVehicle(v.stateOfVehicle);

  // 2. Resolve bodyStyle with inference fallback
  const bodyStyle =
    normalizeBodyStyle(v.bodyStyle) ||
    inferBodyStyleFromModel(v.model, v.make);

  // 3. Resolve drivetrain using the resolved bodyStyle
  const drivetrain =
    normalizeDrivetrain(v.drivetrain) ||
    inferDrivetrainFromContext(bodyStyle, v.model);

  // 4. Resolve fuelType with inference fallback
  const fuelType =
    normalizeFuelType(v.fuelType) ||
    inferFuelTypeFromContext(v.model, v.make);

  // 5. Resolve transmission with hardcoded fallback
  const transmission = normalizeTransmission(v.transmission) || "AUTOMATIC";

  // 6. Resolve basic string fields with fallbacks
  const year = v.year ?? "0";
  const make = v.make ?? "Unknown";
  const model = v.model ?? "Unknown";
  const exteriorColor = v.exteriorColor ?? "Unknown";
  const mileageValue = v.mileageValue ?? 0;
  const priceValue = v.price ?? 0;
  const msrpValue = v.msrp ?? v.price ?? 0;

  // 7. Resolve trim with hardcoded fallback
  const trim = v.trim ?? "Base";

  // 8. Parse address and build JSON column
  const addressFields = parseAddressFields(v.address || v.dealer?.address || "");
  const addressJson = formatAddressAsJSON(addressFields);

  // 9. Build description with generated fallback
  const description =
    v.description ||
    `${year} ${make} ${model} — ${stateOfVehicle}, ${mileageValue} miles`;

  return {
    vin: (v.vin ?? "").toUpperCase(),
    state_of_vehicle: stateOfVehicle,
    year,
    make,
    model,
    trim,
    drivetrain,
    transmission,
    exterior_color: exteriorColor,
    price: `${priceValue} USD`,
    msrp: `${msrpValue} USD`,
    "mileage.value": String(mileageValue),
    fuel_type: fuelType,
    latitude: String(v.latitude ?? v.dealer?.latitude ?? 0),
    longitude: String(v.longitude ?? v.dealer?.longitude ?? 0),
    body_style: bodyStyle,
    url: resolveFeedUrl(v.url || "", v.id, opts),
    title: `${make} ${model}`.trim(),
    vehicle_id: v.id,
    "mileage.unit": "MI",
    ...addressFields,
    address: addressJson,
    "image[0].url": imgs[0] ?? "",
    "image[1].url": imgs[1] ?? imgs[0] ?? "",
    fb_page_id: v.dealer?.fbPageId ?? "",
    description,
    availability: v.archivedAt == null ? "available" : "not_available",
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

export const VALID_VERTICALS = ["automotive", "services", "ecommerce", "realestate"] as const;
export type Vertical = (typeof VALID_VERTICALS)[number];

export const VERTICAL_LABELS: Record<Vertical, string> = {
  automotive: "Automotive",
  services: "Services",
  ecommerce: "E-commerce",
  realestate: "Real Estate",
};

export const VERTICAL_META_TYPE: Record<Vertical, string> = {
  automotive: "vehicles",
  services: "local_service_businesses",
  ecommerce: "products",
  realestate: "home_listings",
};

export interface VerticalFieldDef {
  key: string;
  label: string;
  required: boolean;
  type: "text" | "textarea" | "number" | "select";
  placeholder?: string;
  options?: string[];
}

export const SERVICES_FIELDS: VerticalFieldDef[] = [
  { key: "name", label: "Service Name", required: true, type: "text", placeholder: "e.g. House Deep Cleaning" },
  { key: "description", label: "Description", required: true, type: "textarea", placeholder: "What does this service include?" },
  { key: "price", label: "Price / Price Range", required: true, type: "text", placeholder: "e.g. $99 or $50\u2013$200" },
  { key: "category", label: "Category", required: true, type: "select", options: ["Home Services", "Beauty & Personal Care", "Auto Repair", "Consulting", "Other"] },
  { key: "address", label: "Service Area / Location", required: true, type: "text", placeholder: "e.g. Atlanta, GA" },
  { key: "url", label: "Booking / Contact URL", required: true, type: "text", placeholder: "https://..." },
  { key: "availability", label: "Availability", required: false, type: "text", placeholder: "e.g. Mon\u2013Fri 9am\u20135pm" },
];

export const ECOMMERCE_FIELDS: VerticalFieldDef[] = [
  { key: "title", label: "Title", required: true, type: "text", placeholder: "Product title" },
  { key: "description", label: "Description", required: true, type: "textarea", placeholder: "Product description" },
  { key: "price", label: "Price", required: true, type: "text", placeholder: "e.g. 29.99" },
  { key: "brand", label: "Brand", required: true, type: "text", placeholder: "Brand name" },
  { key: "condition", label: "Condition", required: true, type: "select", options: ["new", "used", "refurbished"] },
  { key: "availability", label: "Availability", required: true, type: "select", options: ["in stock", "out of stock"] },
  { key: "retailer_id", label: "SKU / Retailer ID", required: true, type: "text", placeholder: "SKU-12345" },
  { key: "url", label: "Product URL", required: true, type: "text", placeholder: "https://..." },
  { key: "google_product_category", label: "Google Product Category", required: false, type: "text", placeholder: "Optional category" },
];

export const REALESTATE_FIELDS: VerticalFieldDef[] = [
  { key: "name", label: "Listing Name", required: true, type: "text", placeholder: "e.g. Beautiful 3BR Home" },
  { key: "description", label: "Description", required: true, type: "textarea", placeholder: "Property description" },
  { key: "price", label: "Price", required: true, type: "text", placeholder: "e.g. 350000" },
  { key: "address", label: "Address", required: true, type: "text", placeholder: "123 Main St" },
  { key: "city", label: "City", required: true, type: "text", placeholder: "Atlanta" },
  { key: "region", label: "State", required: true, type: "text", placeholder: "GA" },
  { key: "postal_code", label: "Zip", required: true, type: "text", placeholder: "30301" },
  { key: "num_beds", label: "Bedrooms", required: true, type: "number", placeholder: "3" },
  { key: "num_baths", label: "Bathrooms", required: true, type: "number", placeholder: "2" },
  { key: "property_type", label: "Property Type", required: true, type: "select", options: ["for_sale", "for_rent"] },
  { key: "url", label: "Listing URL", required: true, type: "text", placeholder: "https://..." },
  { key: "area_size", label: "Square Footage", required: false, type: "number", placeholder: "1800" },
];

export function getFieldsForVertical(vertical: string): VerticalFieldDef[] {
  switch (vertical) {
    case "services": return SERVICES_FIELDS;
    case "ecommerce": return ECOMMERCE_FIELDS;
    case "realestate": return REALESTATE_FIELDS;
    default: return [];
  }
}

/** Required image field key per vertical (automotive handles images separately). */
export const VERTICAL_REQUIRED_IMAGE: Record<string, string | null> = {
  automotive: null,
  services: null,
  ecommerce: "image_url",
  realestate: "image_url",
};

export function getRequiredFields(vertical: string): string[] {
  const fields = getFieldsForVertical(vertical)
    .filter((f) => f.required)
    .map((f) => f.key);

  const imageField = VERTICAL_REQUIRED_IMAGE[vertical];
  if (imageField && !fields.includes(imageField)) {
    fields.push(imageField);
  }

  return fields;
}

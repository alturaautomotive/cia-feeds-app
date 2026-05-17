import { z } from "zod";

export const EXTRACTION_SCHEMA = z.object({
  vin: z.string().nullable().optional(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  year: z.union([z.string(), z.number()]).nullable().optional(),
  body_style: z.string().nullable().optional(),
  price: z.union([z.string(), z.number()]).nullable().optional(),
  mileage_value: z.union([z.string(), z.number()]).nullable().optional(),
  state_of_vehicle: z.string().nullable().optional(),
  exterior_color: z.string().nullable().optional(),
  trim: z.string().nullable().optional(),
  drivetrain: z.string().nullable().optional(),
  transmission: z.string().nullable().optional(),
  fuel_type: z.string().nullable().optional(),
  msrp: z.union([z.string(), z.number()]).nullable().optional(),
  image_url: z.string().nullable().optional(),
  image_url_2: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  latitude: z.union([z.string(), z.number()]).nullable().optional(),
  longitude: z.union([z.string(), z.number()]).nullable().optional(),
});

export const ECOMMERCE_EXTRACTION_SCHEMA = z.object({
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  price: z.union([z.string(), z.number()]).nullable().optional(),
  brand: z.string().nullable().optional(),
  condition: z.enum(["new", "used", "refurbished"]).nullable().optional(),
  availability: z.enum(["in stock", "out of stock"]).nullable().optional(),
  retailer_id: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  image_url_2: z.string().nullable().optional(),
  google_product_category: z.string().nullable().optional(),
});

export const SERVICES_EXTRACTION_SCHEMA = z.object({
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  price: z.union([z.string(), z.number()]).nullable().optional(),
  images: z.array(z.string()).nullable().optional(),
  booking_url: z.string().nullable().optional(),
  cta_text: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

export const SERVICES_EXTRACTION_PROMPT = `
Extract the following service information from this page:
- title: the service name
- description: a brief description of the service
- price: the listed price or price range as a string (e.g., "$49" or "$49 - $99")
- images: an array of all image URLs on the page
- booking_url: the link to book, schedule, or reserve the service
- cta_text: the text of the main call-to-action button (e.g., "Book Now", "Schedule Appointment")
- brand: the business or brand name
- category: the type or category of service
- address: the location or service area

Return null for any field you cannot find.
`;

/**
 * Real-estate listing extraction. Targets typical MLS / Zillow / Realtor /
 * Redfin / dealer-IDX page layouts.
 *
 * Notes on field choices:
 *   - `name` is the title shown on Meta's HOME_LISTING catalog cards. It is
 *     usually "<bedrooms>BR / <bathrooms>BA - <street_address>".
 *   - `property_type` maps to Meta's enum: for_sale | for_rent.
 *   - `area_size` is square footage, numeric only (no "sq ft" suffix).
 *   - We capture an array of `images` so the storefront + catalog get the
 *     full gallery, not just a hero shot.
 */
export const REALESTATE_EXTRACTION_SCHEMA = z.object({
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  price: z.union([z.string(), z.number()]).nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  num_beds: z.union([z.string(), z.number()]).nullable().optional(),
  num_baths: z.union([z.string(), z.number()]).nullable().optional(),
  property_type: z.enum(["for_sale", "for_rent"]).nullable().optional(),
  area_size: z.union([z.string(), z.number()]).nullable().optional(),
  year_built: z.union([z.string(), z.number()]).nullable().optional(),
  images: z.array(z.string()).nullable().optional(),
  url: z.string().nullable().optional(),
  latitude: z.union([z.string(), z.number()]).nullable().optional(),
  longitude: z.union([z.string(), z.number()]).nullable().optional(),
});

export const REALESTATE_EXTRACTION_PROMPT = `
Extract the following property information from this real estate listing page:
- name: a short title for the listing (typical format: "3BR / 2BA - 123 Main St"). Fall back to street address if no headline exists.
- description: the property's marketing description (1-3 sentences).
- price: the listed price as a number (no currency symbol, no commas). For rentals, use the monthly rent. Example: 350000 or 2500.
- address: street address only (e.g., "123 Main St Unit 4B").
- city: city name only.
- region: 2-letter US state abbreviation (e.g., "GA", "CA").
- postal_code: 5-digit ZIP.
- num_beds: bedroom count as a number.
- num_baths: bathroom count as a number (decimals allowed, e.g., 2.5).
- property_type: "for_sale" if listed for sale, "for_rent" if listed for rent. Default to "for_sale" if unclear.
- area_size: total interior square footage as a number (no "sq ft" suffix).
- year_built: the year the property was constructed.
- images: an array of every photo URL on the page (gallery, hero, virtual tour stills).
- url: the canonical listing URL.
- latitude / longitude: if the page exposes coordinates (most MLS pages don't).

Return null for any field you cannot find. Do NOT invent values.
`;

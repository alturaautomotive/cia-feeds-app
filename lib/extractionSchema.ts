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

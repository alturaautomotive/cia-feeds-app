import { z } from "zod";

// --- Auth schemas ---

export const signupBodySchema = z.strictObject({
  name: z
    .string()
    .min(1, "name is required")
    .max(200, "name must be 200 characters or fewer")
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "name must not be blank"),
  email: z
    .string()
    .min(1, "email is required")
    .max(320, "email too long")
    .email("invalid email format"),
  password: z
    .string()
    .min(8, "password must be at least 8 characters")
    .max(128, "password must be 128 characters or fewer"),
  vertical: z
    .enum(["automotive", "services", "ecommerce", "realestate"])
    .optional(),
});

export const forgotPasswordBodySchema = z.strictObject({
  email: z
    .string()
    .min(1, "email is required")
    .max(320, "email too long")
    .email("invalid email format"),
});

// --- Meta schemas ---

export const metaCatalogCreateSchema = z.strictObject({
  businessId: z.string().min(1, "businessId is required"),
  catalogName: z.string().min(1, "catalogName is required"),
});

export const metaCatalogSelectSchema = z.strictObject({
  businessId: z.string().min(1, "businessId is required"),
  catalogId: z.string().min(1, "catalogId is required"),
});

export const fbCatalogPostSchema = z.strictObject({
  businessId: z.string().min(1, "businessId is required"),
  catalogId: z.string().min(1, "catalogId is required").optional(),
  catalogName: z.string().min(1, "catalogName is required").optional(),
}).refine(
  (data) => !!data.catalogId || !!data.catalogName,
  { message: "catalogId or catalogName is required" }
);

export const adminMetaDeliverySchema = z.strictObject({
  metaDeliveryMethod: z.enum(["csv", "api"]),
});

export const adminMetaDeliveryParamSchema = z.strictObject({
  id: z.string().uuid("invalid dealer id"),
});

export const adminFeedRescrapeBodySchema = z.strictObject({
  dealerId: z.string().uuid("invalid dealerId").optional(),
  vertical: z.enum(["automotive", "services", "ecommerce", "realestate"]).optional(),
});

export const adminFeedRescrapeQuerySchema = z.strictObject({
  dealerId: z.string().uuid("invalid dealerId").optional(),
});

// --- Team accept schema ---

export const teamAcceptBodySchema = z.strictObject({
  token: z.string().min(1, "token is required"),
  name: z
    .string()
    .min(1, "name is required")
    .max(200, "name must be 200 characters or fewer")
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "name must not be blank"),
  password: z
    .string()
    .min(8, "password must be at least 8 characters")
    .max(128, "password must be 128 characters or fewer"),
});

import { z } from "zod";

export const metaCatalogCreateSchema = z.strictObject({
  businessId: z.string().min(1, "businessId is required"),
  catalogName: z.string().min(1, "catalogName is required"),
});

export const metaCatalogSelectSchema = z.strictObject({
  businessId: z.string().min(1, "businessId is required"),
  catalogId: z.string().min(1, "catalogId is required"),
});

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

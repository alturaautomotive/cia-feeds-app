-- Storefront / white-label fields (whitelabel feature).
--
-- themePreset:       string key into lib/brandPresets.ts (e.g. "toyota", "mazda", "custom")
-- themeOverrides:    JSON map of CSS-variable overrides — used when themePreset = "custom"
--                    or to selectively override individual colors of a preset.
-- logoUrl:           storefront-quality logo (wider than the dashboard avatar).
--                    profileImageUrl is the fallback.
-- customDomain:      already exists as String? but unindexed; add unique index.

ALTER TABLE public."Dealer"
  ADD COLUMN IF NOT EXISTS "themePreset"    TEXT,
  ADD COLUMN IF NOT EXISTS "themeOverrides" JSONB,
  ADD COLUMN IF NOT EXISTS "logoUrl"        TEXT;

-- Unique index on customDomain — a domain can only point at one dealer.
-- (Partial index so NULLs are allowed; only non-null values must be unique.)
CREATE UNIQUE INDEX IF NOT EXISTS "Dealer_customDomain_unique"
  ON public."Dealer" ("customDomain")
  WHERE "customDomain" IS NOT NULL;

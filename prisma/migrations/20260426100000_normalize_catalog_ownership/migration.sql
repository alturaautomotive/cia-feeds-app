-- Normalize legacy metaCatalogOwnership values to the canonical set.
-- "existing" and "client_owned" both map to "selected"; "created" stays as-is.

UPDATE "Dealer"
SET "metaCatalogOwnership" = 'selected'
WHERE "metaCatalogOwnership" IN ('existing', 'client_owned');

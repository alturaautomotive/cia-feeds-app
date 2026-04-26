/**
 * Canonical values for Dealer.metaCatalogOwnership.
 *
 * "selected" — dealer chose an existing catalog from their Business Manager.
 * "created"  — we created a new catalog on the dealer's behalf.
 */
export const CATALOG_OWNERSHIP = {
  SELECTED: "selected",
  CREATED: "created",
} as const;

export type CatalogOwnership =
  (typeof CATALOG_OWNERSHIP)[keyof typeof CATALOG_OWNERSHIP];

/** Legacy values that should be normalised on read/write. */
export const LEGACY_OWNERSHIP_MAP: Record<string, CatalogOwnership> = {
  existing: CATALOG_OWNERSHIP.SELECTED,
  client_owned: CATALOG_OWNERSHIP.SELECTED,
};

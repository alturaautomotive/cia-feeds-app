import { prisma } from "@/lib/prisma";
import { getRequiredFields } from "@/lib/verticals";

export interface ScrapedServiceData {
  title?: string | null;
  description?: string | null;
  price?: string | number | null;
  booking_url?: string | null;
  cta_text?: string | null;
  category?: string | null;
  brand?: string | null;
}

export interface DraftServiceData {
  title: string;
  category?: string | null;
  price?: string | number | null;
  brand?: string | null;
}

export type UrlMatchVerdict = "strong" | "weak" | "unrelated";

export type PublishStatus =
  | "draft"
  | "validated"
  | "ready_to_publish"
  | "published"
  | "blocked";

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "ref",
];

const BOOKING_KEYWORDS = [
  "book",
  "schedule",
  "appointment",
  "reserve",
  "contact",
  "call",
  "get quote",
];

/**
 * Canonicalizes a URL by lowercasing the hostname, stripping a leading `www.`
 * prefix, removing tracking parameters, and trimming a trailing slash from
 * non-root paths.
 *
 * @throws {Error} if `url` is not a valid absolute URL parseable by the
 *   `URL` constructor. Callers should validate input (e.g., via `isValidUrl`)
 *   before invoking this function.
 */
export function canonicalizeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: unable to canonicalize "${url}"`);
  }

  for (const param of TRACKING_PARAMS) {
    parsed.searchParams.delete(param);
  }

  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.hostname.startsWith("www.")) {
    parsed.hostname = parsed.hostname.slice(4);
  }

  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  return parsed.toString();
}

export async function isDuplicateCanonicalUrl(
  dealerId: string,
  canonicalUrl: string,
  excludeListingId?: string
): Promise<boolean> {
  const result = await prisma.listing.findFirst({
    where: {
      dealerId,
      canonicalUrl,
      archivedAt: null,
      ...(excludeListingId ? { NOT: { id: excludeListingId } } : {}),
    },
  });
  return !!result;
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length > 0)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set<string>();
  for (const token of a) {
    if (b.has(token)) intersection.add(token);
  }
  const union = new Set<string>([...a, ...b]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

function hasValue(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return !Number.isNaN(value);
  return value.trim().length > 0;
}

export function scoreServiceUrlMatch(
  scraped: ScrapedServiceData,
  draft: DraftServiceData
): { score: number; verdict: UrlMatchVerdict } {
  let score = 0;

  // Title keyword overlap (0-40)
  if (scraped.title && draft.title) {
    const scrapedTokens = tokenize(scraped.title);
    const draftTokens = tokenize(draft.title);
    const similarity = jaccardSimilarity(scrapedTokens, draftTokens);
    score += similarity * 40;
  }

  // Category match (0-20)
  let categoryAwarded = false;
  if (
    scraped.category &&
    draft.category &&
    scraped.category.toLowerCase() === draft.category.toLowerCase()
  ) {
    score += 20;
    categoryAwarded = true;
  }
  if (!categoryAwarded && draft.category) {
    const draftCategoryLower = draft.category.toLowerCase();
    const scrapedHaystack = [scraped.title, scraped.description]
      .filter((v): v is string => typeof v === "string")
      .join(" ")
      .toLowerCase();
    if (scrapedHaystack.includes(draftCategoryLower)) {
      score += 10;
    }
  }

  // Price presence (0-15)
  if (hasValue(scraped.price ?? null)) {
    score += 15;
  }

  // Booking CTA presence (0-15)
  const hasBookingUrl =
    typeof scraped.booking_url === "string" && scraped.booking_url.trim().length > 0;
  const ctaTextLower = (scraped.cta_text ?? "").toLowerCase();
  const hasBookingKeyword = BOOKING_KEYWORDS.some((keyword) =>
    ctaTextLower.includes(keyword)
  );
  if (hasBookingUrl || hasBookingKeyword) {
    score += 15;
  }

  // Brand match (0-10)
  if (scraped.brand && draft.brand) {
    const scrapedBrandLower = scraped.brand.toLowerCase();
    const draftBrandLower = draft.brand.toLowerCase();
    if (
      scrapedBrandLower.includes(draftBrandLower) ||
      draftBrandLower.includes(scrapedBrandLower)
    ) {
      score += 10;
    }
  }

  // Cap at 100
  if (score > 100) score = 100;

  let verdict: UrlMatchVerdict;
  if (score >= 60) {
    verdict = "strong";
  } else if (score >= 30) {
    verdict = "weak";
  } else {
    verdict = "unrelated";
  }

  return { score, verdict };
}

export function derivePublishStatus(
  verdict: UrlMatchVerdict,
  isComplete: boolean
): PublishStatus {
  if (verdict === "unrelated") return "draft";
  if (verdict === "weak") return "validated";
  // verdict === "strong"
  return isComplete ? "ready_to_publish" : "validated";
}

/**
 * Core completeness computation shared between the validate-url route and the
 * listing PATCH handler. The `price` field is treated as present when the
 * top-level `Listing.price` column is set, regardless of whether `data.price`
 * is present — this matches the DB shape where `price` is a first-class column.
 */
function computeCompletenessCore(
  vertical: string,
  title: string | null | undefined,
  hasTopLevelPrice: boolean,
  data: Record<string, unknown>,
  imageUrls: readonly string[]
): { missingFields: string[]; isComplete: boolean } {
  const requiredFields = getRequiredFields(vertical);
  const missingFields = requiredFields.filter((f) => {
    if (f === "image_url") return false;
    if (f === "title" || f === "name") {
      return !title || title.trim() === "";
    }
    if (f === "price") {
      if (hasTopLevelPrice) return false;
      const val = data[f];
      if (val === undefined || val === null) return true;
      if (typeof val === "string" && val.trim() === "") return true;
      return false;
    }
    const val = data[f];
    if (val === undefined || val === null) return true;
    if (typeof val === "string" && val.trim() === "") return true;
    return false;
  });
  if (requiredFields.includes("image_url") && imageUrls.length === 0) {
    missingFields.push("image_url");
  }
  return { missingFields, isComplete: missingFields.length === 0 };
}

/**
 * Compute completeness directly from a persisted Listing row (used by the
 * validate-url route, which has no pending updates to merge in).
 */
export function computeCompletenessFromListing(listing: {
  vertical: string;
  title: string;
  price: number | null;
  data: unknown;
  imageUrls: string[];
}): { missingFields: string[]; isComplete: boolean } {
  const data = (listing.data ?? {}) as Record<string, unknown>;
  return computeCompletenessCore(
    listing.vertical,
    listing.title,
    listing.price != null,
    data,
    listing.imageUrls
  );
}

/**
 * Compute completeness from the merged/pending values used by the listing
 * PATCH handler. `hasTopLevelPrice` should reflect both the pending update and
 * the existing top-level `Listing.price` value (e.g.
 * `updateData.price != null || listing.price != null`).
 */
export function computeCompletenessFromMerged(input: {
  vertical: string;
  title: string | null | undefined;
  hasTopLevelPrice: boolean;
  data: Record<string, unknown>;
  imageUrls: readonly string[];
}): { missingFields: string[]; isComplete: boolean } {
  return computeCompletenessCore(
    input.vertical,
    input.title,
    input.hasTopLevelPrice,
    input.data,
    input.imageUrls
  );
}

/**
 * The full set of required fields for a Services listing to be considered
 * complete for publication. Includes fields that may be filled by scrape,
 * by the user, or by dealer-derived fallbacks.
 */
export const SERVICES_COMPLETENESS_FIELDS = [
  "name",
  "description",
  "price",
  "category",
  "address",
  "url",
  "image_url",
  "availability",
  "brand",
  "condition",
  "fb_product_category",
] as const;

export type FieldSource = "scraped" | "user_entered" | "fallback" | "fallback_low_confidence";
export type FieldSourcesMap = Record<string, FieldSource>;

const LOW_CONFIDENCE_FIELDS = new Set(["description", "price", "image_url"]);

export const HIGH_QUALITY_KEY_FIELDS = ["description", "price", "image_url"] as const;

export function computeIsHighQuality(fieldSources: FieldSourcesMap): boolean {
  return HIGH_QUALITY_KEY_FIELDS.every(
    (f) => fieldSources[f] !== "fallback_low_confidence"
  );
}

function isNonEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return !Number.isNaN(value);
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

/**
 * Checks whether a Services listing has all required fields filled.
 *
 * - `name` is sourced from the `title` param.
 * - `image_url` is sourced from the `imageUrls` array (at least one entry).
 * - `url` and all other fields are read from `data`.
 */
export function checkServicesCompleteness(
  data: Record<string, unknown>,
  imageUrls: string[],
  title: string | null | undefined
): { isComplete: boolean; missingFields: string[] } {
  const missingFields: string[] = [];

  for (const field of SERVICES_COMPLETENESS_FIELDS) {
    if (field === "name") {
      if (!title || title.trim().length === 0) missingFields.push(field);
      continue;
    }
    if (field === "image_url") {
      if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        missingFields.push(field);
      }
      continue;
    }
    if (!isNonEmpty(data[field])) {
      missingFields.push(field);
    }
  }

  return { isComplete: missingFields.length === 0, missingFields };
}

/**
 * Builds a FieldSourcesMap tagging each required Services field with its
 * origin: user-entered, fallback-applied, scraped, or missing.
 */
export function buildFieldSources(
  rawData: Record<string, unknown>,
  fallbackKeys: Set<string>,
  userKeys?: Set<string>
): FieldSourcesMap {
  const sources: FieldSourcesMap = {};
  for (const field of SERVICES_COMPLETENESS_FIELDS) {
    if (userKeys && userKeys.has(field)) {
      sources[field] = "user_entered";
      continue;
    }
    if (fallbackKeys.has(field)) {
      sources[field] = LOW_CONFIDENCE_FIELDS.has(field) ? "fallback_low_confidence" : "fallback";
      continue;
    }
    if (isNonEmpty(rawData[field])) {
      sources[field] = "scraped";
      continue;
    }
    sources[field] = "fallback_low_confidence";
  }
  return sources;
}

/**
 * Applies dealer-derived fallback values for missing Services fields.
 * Mutates and returns the provided `data` object, along with the set of
 * keys where a fallback was applied.
 */
export function applyServicesFallbacks(
  data: Record<string, unknown>,
  dealer: { name: string; address: string | null }
): { data: Record<string, unknown>; fallbackKeys: Set<string> } {
  const fallbackKeys = new Set<string>();

  if (!isNonEmpty(data.condition)) {
    data.condition = "new";
    fallbackKeys.add("condition");
  }
  if (!isNonEmpty(data.availability)) {
    data.availability = "available for order";
    fallbackKeys.add("availability");
  }
  if (!isNonEmpty(data.brand) && isNonEmpty(dealer.name)) {
    data.brand = dealer.name;
    fallbackKeys.add("brand");
  }
  if (!isNonEmpty(data.address) && isNonEmpty(dealer.address)) {
    data.address = dealer.address;
    fallbackKeys.add("address");
  }
  if (!isNonEmpty(data.fb_product_category)) {
    data.fb_product_category = "Professional Services";
    fallbackKeys.add("fb_product_category");
  }
  if (!isNonEmpty(data.category)) {
    data.category = "Service";
    fallbackKeys.add("category");
  }

  if (!isNonEmpty(data.description)) {
    const parts = [data.name, data.category, data.brand ?? dealer.name].filter(
      (p) => typeof p === "string" && p.trim().length > 0
    );
    data.description = parts.length > 0 ? parts.join(" — ") : "Professional service";
    fallbackKeys.add("description");
  }
  if (!isNonEmpty(data.price)) {
    data.price = "0";
    fallbackKeys.add("price");
  }

  return { data, fallbackKeys };
}

/**
 * Decides whether a listing's current publishStatus should be downgraded
 * because required fields are no longer complete. Pure function — performs
 * no DB access.
 *
 * - `published` + incomplete → `validated` (downgraded)
 * - `ready_to_publish` + incomplete → `validated` (downgraded)
 * - otherwise → unchanged
 */
export function revalidatePublishStatus(
  currentStatus: string,
  isComplete: boolean
): { publishStatus: string; downgraded: boolean } {
  if (!isComplete && (currentStatus === "published" || currentStatus === "ready_to_publish")) {
    return { publishStatus: "validated", downgraded: true };
  }
  return { publishStatus: currentStatus, downgraded: false };
}

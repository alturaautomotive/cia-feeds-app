import { prisma } from "@/lib/prisma";

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

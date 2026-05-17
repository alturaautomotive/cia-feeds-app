/**
 * Real-estate listing image harvester.
 *
 * Why this exists:
 *   The Firecrawl LLM-extraction path returns only the hero image for most
 *   real-estate listings. Zillow / Realtor / Redfin lazy-load their photo
 *   galleries, so the markdown Firecrawl renders to the extractor contains
 *   only a single <img> URL even though the full gallery (~30 photos) is
 *   embedded in the page's JSON-LD and React hydration payload.
 *
 * Strategy:
 *   1. Pull the raw HTML with the stealth proxy (same engine that succeeds
 *      on Zillow's anti-bot wall).
 *   2. Regex out every CDN image URL we recognise for the major real-estate
 *      portals. These URLs appear inline in the HTML \u2014 no JavaScript
 *      execution required.
 *   3. Dedupe + cap. Return [] on any failure so the caller can fall back
 *      to whatever the LLM extractor already returned.
 *
 * Adding a new portal: append a regex to PHOTO_CDN_PATTERNS. The match
 * group must be the full URL (or a fragment we can resolve to an absolute
 * URL by prepending the portal's CDN origin).
 */
import { firecrawlClient } from "@/lib/firecrawl";

// Match the longest reasonable image URL on the page. CDN URLs are typically
// 80-300 chars; we cap at 600 to avoid matching gigantic JSON blobs that
// happen to embed image-like substrings.
const PHOTO_CDN_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // Zillow: https://photos.zillowstatic.com/fp/<hash>-cc_ft_<size>.jpg
  // and other variants (-uncropped_scaled_within_*, -p_h, -fp_*).
  { name: "zillow", pattern: /https:\/\/photos\.zillowstatic\.com\/[^"'\\\s<>]{20,400}\.(?:jpg|jpeg|png|webp)/gi },
  // Realtor.com: https://ap.rdcpix.com/<hash>/<digits>-mr<n>s.jpg
  { name: "realtor", pattern: /https:\/\/ap\.rdcpix\.com\/[^"'\\\s<>]{20,400}\.(?:jpg|jpeg|png|webp)/gi },
  // Redfin: https://ssl.cdn-redfin.com/photo/<digits>/[bigphoto|mbpaddedwide]/<hash>.jpg
  { name: "redfin", pattern: /https:\/\/ssl\.cdn-redfin\.com\/photo\/[^"'\\\s<>]{20,400}\.(?:jpg|jpeg|png|webp)/gi },
  // Trulia (Zillow-owned, sometimes still serves from its own CDN).
  { name: "trulia", pattern: /https:\/\/[a-z0-9.-]*\.akamaihd\.net\/[^"'\\\s<>]{20,400}\.(?:jpg|jpeg|png|webp)/gi },
];

/**
 * Heuristic: prefer the largest size variant of each unique photo.
 *
 * Real-estate CDNs encode the size in the URL filename:
 *   Zillow:    -sc_192_128.webp, -cc_ft_768.jpg, -uncropped_scaled_within_1536_1024.webp
 *   Realtor:   -m1936s.jpg, -w480_h480.jpg
 *   Redfin:    /bigphoto/<hash>.jpg, /mbpaddedwide/<hash>.jpg
 *
 * Strategy: derive a stable "photo identity" key by locating the photo
 * hash (the long hex/digit string before the size suffix) and grouping by
 * it. Within each group, score each URL by its decoded pixel dimensions
 * and keep the largest.
 */
function extractPhotoKey(url: string): string {
  // Zillow / Realtor: /fp/<hash>- ... or /<hash>-/<size>...
  const hexMatch = /\/([a-f0-9]{16,})/i.exec(url);
  if (hexMatch) return hexMatch[1];
  // Redfin: ...photo/<digits>/<variant>/<hash>.jpg — use the hash filename.
  const tailMatch = /\/([^/]+)\.(?:jpg|jpeg|png|webp)$/i.exec(url);
  return tailMatch ? tailMatch[1] : url;
}

function scoreUrl(url: string): number {
  // Match WxH or W_H patterns anywhere in the URL. Score = W * H so we
  // favour higher-resolution variants. Fallback: just the largest number
  // that looks like a dimension.
  const wh = /(\d{3,4})[x_](\d{3,4})/.exec(url);
  if (wh) return parseInt(wh[1], 10) * parseInt(wh[2], 10);
  const single = /[-_](\d{3,4})(?=[._-]|$)/.exec(url);
  if (single) return parseInt(single[1], 10) * parseInt(single[1], 10);
  // No size info — give it a baseline score so it isn't always discarded.
  return 1;
}

function dedupeAndPreferLargest(urls: string[]): string[] {
  const best = new Map<string, { url: string; score: number }>();
  for (const url of urls) {
    const key = extractPhotoKey(url);
    const score = scoreUrl(url);
    const existing = best.get(key);
    if (!existing || score > existing.score) {
      best.set(key, { url, score });
    }
  }
  return Array.from(best.values()).map((v) => v.url);
}

const MAX_IMAGES = 30;

export async function harvestRealestateImages(url: string): Promise<string[]> {
  try {
    // Same proxy/timeout config as the listing scraper \u2014 stealth gets us
    // past Zillow's anti-bot, raw HTML is the source of truth for image URLs.
    const response = await firecrawlClient.scrape(url, {
      formats: ["html"],
      proxy: "stealth",
      timeout: 90_000,
    } as Parameters<typeof firecrawlClient.scrape>[1]);

    const html = (response as { html?: unknown })?.html;
    if (typeof html !== "string" || html.length === 0) return [];

    const found: string[] = [];
    for (const { pattern } of PHOTO_CDN_PATTERNS) {
      // Reset regex state since we're using /g.
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(html)) !== null) {
        found.push(m[0]);
      }
    }

    const deduped = dedupeAndPreferLargest(found);
    // Sort by URL length descending so larger variants tend to come first
    // (within a single CDN's pattern set), then cap.
    deduped.sort((a, b) => b.length - a.length);
    return deduped.slice(0, MAX_IMAGES);
  } catch {
    return [];
  }
}

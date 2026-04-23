import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const LIBRE_TRANSLATE_URL = "https://libretranslate.de/translate";

const TONE_PREFIXES: Record<string, string> = {
  funny: "Translate this in a fun, playful way with emojis and casual language 😎: ",
  luxury: "Translate this using upscale, premium, sophisticated vocabulary: ",
  professional: "",
};

// In-memory cache: key → { text, expiry }
const cache = new Map<string, { text: string; expiry: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function simpleHash(str: string): string {
  return createHash("md5").update(str).digest("hex").slice(0, 8);
}

function cacheKey(
  dealerId: string,
  lang: string,
  tone: string,
  text: string
): string {
  return `${dealerId}-${lang}-${tone}-${simpleHash(text)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Translate text via LibreTranslate with tone prefix, caching, and retry on 429.
 *
 * @param text      - Source text (English)
 * @param dealerId  - Dealer ID (used for cache scoping)
 * @param lang      - Target language code (e.g. "es", "fr", "de")
 * @param tone      - Optional tone: "funny" | "luxury" | "professional"
 * @returns Translated text, or the original text on failure
 */
export async function translate(
  text: string,
  dealerId: string,
  lang: string,
  tone?: string
): Promise<string> {
  if (!text || lang === "en") return text;

  const resolvedTone = tone || "professional";
  const key = cacheKey(dealerId, lang, resolvedTone, text);

  // Check cache
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiry) {
    return cached.text;
  }

  const prefix = TONE_PREFIXES[resolvedTone] ?? "";
  const prefixedText = prefix + text;

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(LIBRE_TRANSLATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: prefixedText,
          source: "en",
          target: lang,
          format: "text",
        }),
      });

      if (res.status === 429) {
        console.warn(
          `[translate] 429 rate limited (attempt ${attempt}/${MAX_RETRIES})`
        );
        if (attempt < MAX_RETRIES) {
          await sleep(1000 * attempt);
          continue;
        }
        console.warn("[translate] rate limit retries exhausted, returning original");
        return text;
      }

      if (!res.ok) {
        console.error(`[translate] HTTP ${res.status}: ${res.statusText}`);
        return text;
      }

      const data = await res.json();
      const translatedText: string = data.translatedText ?? text;

      // Evict all if cache grows too large
      if (cache.size > 10000) cache.clear();
      // Store in cache
      cache.set(key, { text: translatedText, expiry: Date.now() + CACHE_TTL_MS });

      return translatedText;
    } catch (err) {
      console.error("[translate] error:", err);
      return text;
    }
  }

  return text;
}

/**
 * Batch-translate a record of key→text pairs sequentially.
 * Returns a record with the same keys mapped to translated text.
 */
export async function translateBatch(
  texts: Record<string, string>,
  dealerId: string,
  lang: string,
  tone?: string
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(texts)) {
    result[key] = await translate(value, dealerId, lang, tone);
  }
  return result;
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  (async () => {
    console.log("Testing translate...");
    const result1 = await translate("Test luxury car", "testDealer", "es", "luxury");
    console.log("Luxury es:", result1);
    const result2 = await translate("Funny sports car! 🚀", "testDealer", "fr", "funny");
    console.log("Funny fr:", result2);
    console.log("Done.");
  })().catch(console.error);
}

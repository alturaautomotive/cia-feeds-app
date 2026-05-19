// Hero image generation for blog posts.
//
// Strategy:
//   v1: Generate a branded banner with OpenAI. We try gpt-image-1 first
//       (best for blog heros when available) and fall back to dall-e-3 if
//       the org isn't verified for gpt-image-1. The fallback is automatic
//       so we never end up with a hero-less post just because of OpenAI's
//       identity-verification gating. The prompt explicitly forbids in-image
//       text either way, so dall-e-3's weaker typography doesn't matter.
//   v2 (when ready): composite an uploaded portrait into the banner. We'll
//       use Sharp for that step. The portrait URL is read from an env var
//       (PORTRAIT_URL) and the composite is rendered server-side.
//
// We upload the final PNG to Supabase Storage (already used by the rest of
// the app) and return the public URL.

import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase";
import { withBreaker, CircuitOpenError } from "@/lib/circuitBreaker";

const HERO_BUCKET = "blog-heroes";

// Last error message produced inside generateBlogHero, for diagnostic
// surfacing on the next admin endpoint call. Not a per-request store —
// fine because admin-triggered backfills are serialised through the
// route and we read this immediately after the call.
let _lastImageGenError: string | null = null;
export function getLastImageGenError(): string | null {
  return _lastImageGenError;
}

export interface BlogImageInput {
  slug: string;
  title: string;
  locale: "en" | "es";
  /**
   * Optional portrait URL. When set, v2 composite path will overlay this
   * image onto the generated banner. v1 simply mentions it in the prompt so
   * the AI generates a stylised illustration of a person where the portrait
   * would go.
   */
  portraitUrl?: string | null;
}

export class BlogImageError extends Error {
  constructor(message: string, public readonly reason: string) {
    super(message);
    this.name = "BlogImageError";
  }
}

function brandPrompt(title: string, locale: "en" | "es"): string {
  // Keep the prompt brand-consistent across posts so the gallery has a
  // coherent look. Indigo + emerald accents match the dashboard chrome.
  const audienceLine =
    locale === "es"
      ? "El público es operadores de concesionarios hispanos en Estados Unidos."
      : "The audience is US car dealer operators and marketing leads.";

  return [
    `Wide 16:9 blog hero banner illustration for the article titled "${title}".`,
    `Style: modern editorial illustration, flat vector with subtle gradients,`,
    `centered focal subject (an abstract dealership / WhatsApp / mobile phone`,
    `motif depending on the title's topic). Negative space on the right for`,
    `the article title overlay rendered by the page (do NOT render the title`,
    `text in the image itself).`,
    `Palette: deep indigo (#4338CA) primary, emerald (#10B981) accent,`,
    `cream (#FAF8F3) background, dark slate (#0F172A) for outlines.`,
    `Clean professional feel, suitable for a B2B SaaS marketing blog.`,
    audienceLine,
    `No watermarks, no logos, no readable text, no faces of real people.`,
  ].join(" ");
}

export async function generateBlogHero(
  input: BlogImageInput
): Promise<string | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.warn({
      event: "blog_image_skipped",
      reason: "no_openai_key",
      slug: input.slug,
    });
    return null;
  }

  // Reset the diagnostic error before each call so the backfill admin
  // endpoint reads only THIS run's error, never a stale one.
  _lastImageGenError = null;

  const openai = new OpenAI({ apiKey: openaiKey });
  const prompt = brandPrompt(input.title, input.locale);

  // Two-tier image generation:
  //   1. Try gpt-image-1 (1536x1024, PNG, medium quality). Best output, but
  //      requires org verification on OpenAI's side.
  //   2. On any access/verification error, fall back to dall-e-3 (1792x1024,
  //      URL-returning, hd quality). Always available. We download the URL
  //      to a buffer since dall-e-3 doesn't support b64_json.
  async function tryGptImage1(): Promise<string | null> {
    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1536x1024",
      output_format: "png",
      quality: "medium",
      n: 1,
    });
    return result.data?.[0]?.b64_json ?? null;
  }

  async function tryDallE3(): Promise<string | null> {
    const result = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      // dall-e-3 only supports 1024x1024, 1024x1792, or 1792x1024.
      size: "1792x1024",
      quality: "hd",
      // dall-e-3 supports b64_json directly via response_format.
      response_format: "b64_json",
      n: 1,
    });
    return result.data?.[0]?.b64_json ?? null;
  }

  function isGptImageAccessError(err: unknown): boolean {
    if (!err) return false;
    const msg = err instanceof Error ? err.message : String(err);
    const m = msg.toLowerCase();
    return (
      m.includes("must be verified") ||
      m.includes("organization") ||
      m.includes("not available") ||
      m.includes("model_not_found") ||
      m.includes("403") ||
      m.includes("401") ||
      m.includes("unsupported")
    );
  }

  // Track BOTH error messages so the caller surfaces them on diagnostics.
  // We still return null on overall failure (cron-friendly), but stash the
  // last error on a module-level WeakMap keyed by input so the backfill
  // endpoint can read it via getLastImageGenError(input) immediately after.
  let b64: string | null = null;
  try {
    b64 = await withBreaker("openai.imageGen", tryGptImage1, {
      timeoutMs: 90_000,
    });
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      console.warn({ event: "blog_image_skipped", reason: "circuit_open", slug: input.slug });
      _lastImageGenError = "circuit_open";
      return null;
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    if (isGptImageAccessError(err)) {
      console.log({
        event: "blog_image_fallback_to_dalle3",
        slug: input.slug,
        reason: errMsg,
      });
      try {
        b64 = await withBreaker("openai.imageGen.dalle3", tryDallE3, {
          timeoutMs: 90_000,
        });
      } catch (fallbackErr) {
        const fbMsg =
          fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        console.warn({
          event: "blog_image_generate_failed",
          slug: input.slug,
          model: "dall-e-3",
          message: fbMsg,
          previousGptError: errMsg,
        });
        _lastImageGenError = `gpt-image-1: ${errMsg.slice(0, 200)} | dall-e-3: ${fbMsg.slice(0, 200)}`;
        return null;
      }
    } else {
      console.warn({
        event: "blog_image_generate_failed",
        slug: input.slug,
        model: "gpt-image-1",
        message: errMsg,
      });
      _lastImageGenError = `gpt-image-1: ${errMsg.slice(0, 400)}`;
      return null;
    }
  }

  if (!b64) {
    console.warn({
      event: "blog_image_generate_failed",
      slug: input.slug,
      reason: "empty_b64",
    });
    _lastImageGenError = "empty_b64";
    return null;
  }

  // Upload to Supabase Storage. Bucket should be configured as public-read
  // so the URL is directly servable from the blog page.
  const supabase = supabaseAdmin;
  const buffer = Buffer.from(b64, "base64");
  const path = `${input.locale}/${input.slug}-${Date.now()}.png`;

  const { error: uploadErr } = await supabase.storage
    .from(HERO_BUCKET)
    .upload(path, buffer, {
      contentType: "image/png",
      upsert: false,
      cacheControl: "31536000",
    });
  if (uploadErr) {
    // Bucket might not exist yet; create it (idempotent) and retry once.
    if (uploadErr.message?.toLowerCase().includes("bucket not found")) {
      try {
        await supabase.storage.createBucket(HERO_BUCKET, {
          public: true,
          fileSizeLimit: "10MB",
        });
        const retry = await supabase.storage
          .from(HERO_BUCKET)
          .upload(path, buffer, {
            contentType: "image/png",
            upsert: false,
            cacheControl: "31536000",
          });
        if (retry.error) {
          console.warn({
            event: "blog_image_upload_failed",
            slug: input.slug,
            message: retry.error.message,
          });
          _lastImageGenError = `supabase_upload_retry: ${retry.error.message}`;
          return null;
        }
      } catch (bucketErr) {
        const bm = bucketErr instanceof Error ? bucketErr.message : String(bucketErr);
        console.warn({
          event: "blog_image_bucket_create_failed",
          slug: input.slug,
          message: bm,
        });
        _lastImageGenError = `supabase_bucket_create: ${bm}`;
        return null;
      }
    } else {
      console.warn({
        event: "blog_image_upload_failed",
        slug: input.slug,
        message: uploadErr.message,
      });
      _lastImageGenError = `supabase_upload: ${uploadErr.message}`;
      return null;
    }
  }

  const { data: publicUrl } = supabase.storage.from(HERO_BUCKET).getPublicUrl(path);
  return publicUrl?.publicUrl ?? null;
}

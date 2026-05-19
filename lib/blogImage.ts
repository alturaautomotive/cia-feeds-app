// Hero image generation for blog posts.
//
// Strategy (post-OpenAI-billing-limit):
//   v2: Generate the banner with Gemini's nano-banana image model under our
//       existing GEMINI_API_KEY. Gemini's image generation is metered against
//       the same project quota we already use for the article body (saves
//       a vendor and a billing relationship). Models tried:
//         1. gemini-2.5-flash-image-preview — fast, free-tier friendly
//         2. gemini-2.5-flash-image-001 — stable alias if preview is gone
//       The model returns inline image bytes in the response candidates;
//       we extract the first image part, base64-decode it, and upload to
//       Supabase Storage exactly like before.
//   v3 (when ready): composite an uploaded portrait into the banner via
//       Sharp. Wire up PORTRAIT_URL env var and overlay server-side.
//
// OpenAI fallback removed: original v1 used gpt-image-1 + dall-e-3 fallback,
// but the OpenAI org hit a billing hard limit (May 2026) so neither worked.
// Keeping dependencies inside the Google ecosystem also simplifies billing.

import { GoogleGenAI, Modality } from "@google/genai";
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

const PREFERRED_MODEL = "gemini-2.5-flash-image-preview";
const FALLBACK_MODEL = "gemini-2.5-flash-image";

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
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.warn({
      event: "blog_image_skipped",
      reason: "no_gemini_key",
      slug: input.slug,
    });
    _lastImageGenError = "no_gemini_key";
    return null;
  }

  // Reset the diagnostic error before each call so the backfill admin
  // endpoint reads only THIS run's error, never a stale one.
  _lastImageGenError = null;

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const prompt = brandPrompt(input.title, input.locale);

  // Try preferred model first, fall back if the preview alias is retired.
  async function callGemini(model: string): Promise<string | null> {
    const response = await ai.models.generateContent({
      model,
      contents: [{ text: prompt }],
      config: {
        // Both TEXT and IMAGE modalities required — Gemini emits any image
        // bytes as inlineData parts on the candidate response.
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts as Array<{ inlineData?: { data?: string; mimeType?: string } }>) {
      if (part.inlineData?.data) {
        return part.inlineData.data;
      }
    }
    return null;
  }

  let b64: string | null = null;
  try {
    b64 = await withBreaker("gemini.imageGen", () => callGemini(PREFERRED_MODEL), {
      timeoutMs: 90_000,
    });
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      console.warn({ event: "blog_image_skipped", reason: "circuit_open", slug: input.slug });
      _lastImageGenError = "circuit_open";
      return null;
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    // Try the stable model alias on any failure with the preview model —
    // common failure mode is the preview model getting retired without
    // notice.
    console.log({
      event: "blog_image_fallback",
      slug: input.slug,
      from: PREFERRED_MODEL,
      to: FALLBACK_MODEL,
      reason: errMsg,
    });
    try {
      b64 = await withBreaker(
        "gemini.imageGen.fallback",
        () => callGemini(FALLBACK_MODEL),
        { timeoutMs: 90_000 }
      );
    } catch (fallbackErr) {
      const fbMsg =
        fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      console.warn({
        event: "blog_image_generate_failed",
        slug: input.slug,
        primaryModel: PREFERRED_MODEL,
        primaryError: errMsg,
        fallbackModel: FALLBACK_MODEL,
        fallbackError: fbMsg,
      });
      _lastImageGenError = `${PREFERRED_MODEL}: ${errMsg.slice(0, 200)} | ${FALLBACK_MODEL}: ${fbMsg.slice(0, 200)}`;
      return null;
    }
  }

  if (!b64) {
    console.warn({
      event: "blog_image_generate_failed",
      slug: input.slug,
      reason: "no_image_in_response",
    });
    _lastImageGenError =
      "Gemini returned a response with no inlineData image part. Prompt may have been refused or output was text-only.";
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

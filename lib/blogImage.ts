// Hero image generation for blog posts.
//
// Strategy:
//   v1: Generate a branded banner with OpenAI gpt-image-1. It handles legible
//       in-image text reliably (logo wordmark, headline) where Gemini's image
//       models tend to garble typography. We pass the post's title and the
//       CIAfeeds brand colour palette so each post has a unique, on-brand
//       banner.
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

  const openai = new OpenAI({ apiKey: openaiKey });
  const prompt = brandPrompt(input.title, input.locale);

  let b64: string;
  try {
    const result = await withBreaker(
      "openai.imageGen",
      () =>
        openai.images.generate({
          model: "gpt-image-1",
          prompt,
          // Wide format optimised for blog hero placement.
          size: "1536x1024",
          // PNG so we can later composite a portrait without artefacts.
          output_format: "png",
          quality: "medium",
          n: 1,
        }),
      { timeoutMs: 90_000 }
    );
    const first = result.data?.[0];
    if (!first?.b64_json) {
      throw new BlogImageError("OpenAI image response missing b64_json", "empty");
    }
    b64 = first.b64_json;
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      console.warn({ event: "blog_image_skipped", reason: "circuit_open", slug: input.slug });
      return null;
    }
    console.warn({
      event: "blog_image_generate_failed",
      slug: input.slug,
      message: err instanceof Error ? err.message : String(err),
    });
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
          return null;
        }
      } catch (bucketErr) {
        console.warn({
          event: "blog_image_bucket_create_failed",
          slug: input.slug,
          message: bucketErr instanceof Error ? bucketErr.message : String(bucketErr),
        });
        return null;
      }
    } else {
      console.warn({
        event: "blog_image_upload_failed",
        slug: input.slug,
        message: uploadErr.message,
      });
      return null;
    }
  }

  const { data: publicUrl } = supabase.storage.from(HERO_BUCKET).getPublicUrl(path);
  return publicUrl?.publicUrl ?? null;
}

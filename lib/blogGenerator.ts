// AI-driven blog post generator for the bi-weekly content engine.
//
// Input: a KeywordPlan row (target keyword + locale + angle hint + landing slug).
// Output: a structured BlogPost draft ready to be persisted, image-composited,
// and published.
//
// Why Gemini 2.5 Pro:
//   - We need 1,500-2,500 word longform that's coherent end-to-end. flash
//     is fine for SMS intent classification, but for an article the
//     accuracy/length tradeoff favours pro.
//   - Native Spanish generation quality on pro is meaningfully better than
//     flash, which matters for our ES pillar pages.
//   - JSON-mode keeps the response parseable without regex-extracting from
//     markdown.
//
// Prompt engineering principles applied:
//   - Specify the exact output schema in the prompt (also enforced after the
//     fact via field validation). Gemini's JSON-mode respects schema hints
//     in the prompt even without OpenAPI tooling.
//   - Embed the SEO target keyword in title, meta description AND first 100
//     words. Modern SEO doesn't reward keyword stuffing but does reward
//     early topical relevance signals.
//   - Demand at least one statistic with a year reference so the post feels
//     timely and ranks higher for "2026" tail queries.
//   - Require a CTA paragraph in the second half that names the landing-page
//     slug so we have a natural anchor for the internal link we inject
//     post-generation.

import { GoogleGenAI } from "@google/genai";
import { withBreaker, CircuitOpenError } from "@/lib/circuitBreaker";

export interface KeywordPlanInput {
  keyword: string;
  locale: "en" | "es";
  angle?: string | null;
  landingSlug: string;
}

export interface GeneratedBlogPost {
  slug: string;
  title: string;
  metaDescription: string;
  excerpt: string;
  bodyMarkdown: string;
}

export class BlogGenerationError extends Error {
  constructor(message: string, public readonly reason: string) {
    super(message);
    this.name = "BlogGenerationError";
  }
}

export function blogSlugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function promptEnglish(p: KeywordPlanInput): string {
  return [
    `You are writing a long-form SEO-optimized blog post for CIAfeeds, a SaaS`,
    `that helps car dealerships and other local businesses run Meta Catalog`,
    `feeds, Click-to-WhatsApp ads, and bilingual lead capture. The post will`,
    `live at https://www.ciafeed.com/blog/<slug> and be mirrored to Medium`,
    `with a canonical link back to our domain.`,
    ``,
    `Target keyword: "${p.keyword}"`,
    `Angle: ${p.angle || "Tactical, dealer-focused, with concrete examples"}`,
    `Landing page slug: /${p.landingSlug} (mention it naturally in the call-to-action paragraph)`,
    ``,
    `Writing style:`,
    `- Confident, direct, dealer-operator voice. No fluff, no hedging.`,
    `- 1,600 to 2,200 words of body.`,
    `- Use the target keyword in the title, the first 100 words, at least one H2, and the meta description.`,
    `- Include at least one statistic with a 2025 or 2026 reference. Cite the source name inline (e.g. "per AS USA", "according to Infobip"). Do not invent URLs.`,
    `- Two practical examples or mini case studies, ideally referencing dealer archetypes (e.g. "Toyota dealer in metro Atlanta").`,
    `- One bulleted checklist or numbered playbook section.`,
    `- One sales-aware call-to-action paragraph late in the article that points readers to /${p.landingSlug}.`,
    `- Avoid em-dashes; use periods or commas.`,
    `- No emojis.`,
    ``,
    `Return ONLY a JSON object with this exact shape (no markdown wrapper, no commentary):`,
    `{`,
    `  "title": "<title under 60 chars, contains the target keyword>",`,
    `  "slug": "<url-safe slug derived from the title, max 60 chars, lowercase-hyphen>",`,
    `  "metaDescription": "<140-160 char meta description, contains the target keyword>",`,
    `  "excerpt": "<2-3 sentence lede, ~250-350 chars, used above the fold and as email blast hook>",`,
    `  "bodyMarkdown": "<full article as Markdown: starts with an H2 (NOT H1), uses H2 and H3, includes a checklist or numbered list, ends with the CTA paragraph>"`,
    `}`,
  ].join("\n");
}

function promptSpanish(p: KeywordPlanInput): string {
  return [
    `Eres redactor de contenido SEO para CIAfeeds, una plataforma SaaS que`,
    `ayuda a concesionarios de autos y otros negocios locales a operar feeds`,
    `de Catálogo de Meta, anuncios Click-to-WhatsApp y captura bilingüe de`,
    `leads. El artículo vivirá en https://www.ciafeed.com/es/blog/<slug> y se`,
    `replicará en Medium con enlace canónico de regreso a nuestro dominio.`,
    ``,
    `Palabra clave objetivo: "${p.keyword}"`,
    `Ángulo: ${p.angle || "Táctico, enfocado en concesionarios, con ejemplos concretos"}`,
    `Página de aterrizaje: /${p.landingSlug} (menciona la ruta de forma natural en el llamado a la acción)`,
    ``,
    `Estilo:`,
    `- Voz directa, confiada, de operador de concesionario. Sin relleno, sin atenuantes.`,
    `- 1,600 a 2,200 palabras de cuerpo.`,
    `- Usa la palabra clave en el título, en los primeros 100 palabras, en al menos un H2, y en la meta descripción.`,
    `- Incluye al menos una estadística con referencia 2025 o 2026. Cita la fuente por nombre (ej: "según AS USA", "de acuerdo con Infobip"). No inventes URLs.`,
    `- Dos ejemplos prácticos o mini casos, idealmente refiriéndote a arquetipos de concesionarios ("concesionario Toyota en el área metropolitana de Atlanta").`,
    `- Una lista con viñetas o numerada accionable.`,
    `- Un párrafo de llamado a la acción en la segunda mitad que dirija a /${p.landingSlug}.`,
    `- Español nativo de mercado hispano de Estados Unidos (no España). Usa "tú" para hablarle al lector.`,
    `- Sin emojis. Sin guiones largos (em-dash); usa puntos o comas.`,
    ``,
    `Devuelve SOLO un objeto JSON con esta estructura exacta (sin envoltorio markdown, sin comentarios):`,
    `{`,
    `  "title": "<título menor a 60 caracteres, contiene la palabra clave>",`,
    `  "slug": "<slug URL-safe derivado del título, max 60 char, minusculas-y-guiones, sin acentos>",`,
    `  "metaDescription": "<meta descripción 140-160 char, contiene la palabra clave>",`,
    `  "excerpt": "<lead de 2-3 oraciones, ~250-350 caracteres, va arriba del fold y se usa como gancho del email>",`,
    `  "bodyMarkdown": "<artículo completo en Markdown: comienza con un H2 (NO H1), usa H2 y H3, incluye una lista accionable, termina con el párrafo CTA>"`,
    `}`,
  ].join("\n");
}

export async function generateBlogPost(
  plan: KeywordPlanInput
): Promise<GeneratedBlogPost> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new BlogGenerationError("GEMINI_API_KEY missing", "no_api_key");
  }

  const prompt = plan.locale === "es" ? promptSpanish(plan) : promptEnglish(plan);
  const ai = new GoogleGenAI({ apiKey });

  let response;
  try {
    response = await withBreaker(
      "gemini.blogGenerator",
      () =>
        ai.models.generateContent({
          // Pro for the longer, higher-quality output we want for ranking pages.
          model: "gemini-2.5-pro",
          contents: [{ text: prompt }],
          config: {
            responseMimeType: "application/json",
            // Longer cap because article bodyMarkdown is around 2,000 words.
            maxOutputTokens: 8000,
            temperature: 0.7,
          },
        }),
      { timeoutMs: 120_000 }
    );
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      throw new BlogGenerationError(
        "Gemini circuit open for blogGenerator",
        "circuit_open"
      );
    }
    throw err;
  }

  const rawText =
    response.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("")
      .trim() ?? "";

  if (!rawText) {
    throw new BlogGenerationError("Gemini returned empty response", "empty_response");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    // Defensive: model occasionally wraps JSON in a markdown code fence.
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "");
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new BlogGenerationError(
        "Gemini returned non-JSON content",
        "unparseable"
      );
    }
  }

  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  let slug =
    typeof parsed.slug === "string" ? blogSlugify(parsed.slug) : "";
  const metaDescription =
    typeof parsed.metaDescription === "string"
      ? parsed.metaDescription.trim()
      : "";
  const excerpt =
    typeof parsed.excerpt === "string" ? parsed.excerpt.trim() : "";
  const bodyMarkdown =
    typeof parsed.bodyMarkdown === "string" ? parsed.bodyMarkdown.trim() : "";

  if (!title || !metaDescription || !excerpt || !bodyMarkdown) {
    throw new BlogGenerationError(
      `Gemini response missing required fields: ${[
        !title && "title",
        !metaDescription && "metaDescription",
        !excerpt && "excerpt",
        !bodyMarkdown && "bodyMarkdown",
      ]
        .filter(Boolean)
        .join(", ")}`,
      "missing_fields"
    );
  }

  if (!slug) slug = blogSlugify(title);

  return {
    slug,
    title,
    metaDescription: metaDescription.slice(0, 160),
    excerpt: excerpt.slice(0, 600),
    bodyMarkdown,
  };
}

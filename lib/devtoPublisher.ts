// Dev.to publisher.
//
// Dev.to (Forem) has a stable, well-documented Articles API. We POST to
// /api/articles with article body + canonical_url set to our domain so all
// the SEO authority stays on ciafeed.com. Dev.to honours canonicalUrl
// properly: Google sees the dev.to copy as a syndicated version and ranks
// the canonical source.
//
// Token: dev.to/settings/extensions -> "DEV Community API Keys". Free,
// instant, no waitlist. We store it in Vercel as DEVTO_API_KEY.
//
// API docs: https://developers.forem.com/api/v1#tag/articles/operation/createArticle
//
// Failure handling: any error returns null. The caller logs the platform
// outcome into BlogPost.crossPosts and continues — Dev.to is enrichment,
// not a hard dependency.

const DEVTO_API = "https://dev.to/api";

export interface DevtoPublishInput {
  title: string;
  bodyMarkdown: string;
  /** Required for SEO — points back to our domain. */
  canonicalUrl: string;
  /** Up to 4 tags, lowercase, alphanumeric (no spaces/hyphens). */
  tags: string[];
  /** Optional hero image URL (dev.to displays it as the article cover). */
  coverImageUrl?: string | null;
}

export interface DevtoPublishResult {
  platform: "devto";
  id: string;
  url: string;
  publishedAt: string;
}

interface DevtoArticleResponse {
  id?: number;
  url?: string;
  published_at?: string;
  error?: string;
}

/**
 * Sanitise tags for Dev.to's strict rules:
 *   - Lowercase
 *   - Alphanumeric only (no hyphens, no underscores in the actual API call;
 *     dev.to silently strips them anyway)
 *   - Max 4 tags
 *   - Each tag <= 30 chars
 *
 * We drop anything that becomes empty after sanitising.
 */
function sanitiseTags(tags: string[]): string[] {
  return tags
    .map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30))
    .filter((t) => t.length >= 2)
    .slice(0, 4);
}

export async function publishToDevto(
  input: DevtoPublishInput
): Promise<DevtoPublishResult | null> {
  const token = process.env.DEVTO_API_KEY;
  if (!token) {
    console.warn({ event: "devto_publish_skipped", reason: "no_token" });
    return null;
  }

  // Compose the body. We add a small "Originally published at" pointer at
  // the bottom for human readers, in addition to the canonical_url field
  // for crawlers.
  const bodyWithPointer = [
    input.bodyMarkdown.trim(),
    "",
    "---",
    "",
    `*Originally published at [${input.canonicalUrl}](${input.canonicalUrl})*.`,
  ].join("\n");

  const payload = {
    article: {
      title: input.title,
      published: true,
      body_markdown: bodyWithPointer,
      canonical_url: input.canonicalUrl,
      tags: sanitiseTags(input.tags),
      ...(input.coverImageUrl
        ? { main_image: input.coverImageUrl }
        : {}),
    },
  };

  let res: Response;
  try {
    res = await fetch(`${DEVTO_API}/articles`, {
      method: "POST",
      headers: {
        "api-key": token,
        "Content-Type": "application/json",
        Accept: "application/vnd.forem.api-v1+json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn({
      event: "devto_publish_failed",
      reason: "fetch_threw",
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn({
      event: "devto_publish_failed",
      status: res.status,
      body: text.slice(0, 300),
    });
    return null;
  }

  let body: DevtoArticleResponse;
  try {
    body = (await res.json()) as DevtoArticleResponse;
  } catch {
    console.warn({ event: "devto_publish_failed", reason: "invalid_json" });
    return null;
  }

  if (!body.id || !body.url) {
    console.warn({
      event: "devto_publish_failed",
      reason: "missing_fields",
      body: JSON.stringify(body).slice(0, 200),
    });
    return null;
  }

  return {
    platform: "devto",
    id: String(body.id),
    url: body.url,
    publishedAt: body.published_at ?? new Date().toISOString(),
  };
}

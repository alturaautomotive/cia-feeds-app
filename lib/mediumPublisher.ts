// Medium publisher.
//
// Medium has a write-only "Publishing API" that lets you create stories on
// behalf of an authenticated user. Key details from their docs:
//   - Auth: bearer integration token from a Medium user's settings.
//   - POST https://api.medium.com/v1/users/{userId}/posts
//   - Required: title, content, contentFormat ("markdown" or "html").
//   - Optional but critical for SEO: canonicalUrl (we set this to our
//     site URL so Medium tells Google "the original lives there"; without
//     it Medium gets the ranking authority and our domain loses).
//   - publishStatus: "public" | "draft" | "unlisted". We default to public.
//   - tags: up to 5; we map our locale + keyword into the tag list.
//
// Failure handling:
//   - Missing/invalid token => return null, log a warning. The blog still
//     publishes on our domain; Medium is enrichment, not a hard dependency.
//   - 4xx => log and return null (token expired, suspended account, etc.)
//   - 5xx => log and return null. Caller can retry on the next cron tick.

const MEDIUM_API = "https://api.medium.com/v1";

interface MediumUserResponse {
  data?: { id?: string };
}

interface MediumPostResponse {
  data?: {
    id?: string;
    url?: string;
    canonicalUrl?: string;
    publishStatus?: string;
  };
  errors?: Array<{ message?: string; code?: number }>;
}

export interface MediumPublishInput {
  title: string;
  bodyMarkdown: string;
  /** Tags shown on the Medium story page. Max 5. */
  tags: string[];
  /** Required for SEO. Should be the canonical URL on our domain. */
  canonicalUrl: string;
}

export interface MediumPublishResult {
  postId: string;
  url: string;
}

export async function publishToMedium(
  input: MediumPublishInput
): Promise<MediumPublishResult | null> {
  const token = process.env.MEDIUM_INTEGRATION_TOKEN;
  if (!token) {
    console.warn({ event: "medium_publish_skipped", reason: "no_token" });
    return null;
  }

  // Resolve the authenticated user's id. This is required for the
  // /users/{userId}/posts endpoint and never changes for a given token, so
  // we could cache it. For v1 we just call /me on every publish — it's a
  // single extra round trip and the cron runs at most a few times a month.
  let userId: string;
  try {
    const meRes = await fetch(`${MEDIUM_API}/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!meRes.ok) {
      console.warn({
        event: "medium_publish_skipped",
        reason: "me_lookup_failed",
        status: meRes.status,
      });
      return null;
    }
    const meBody = (await meRes.json()) as MediumUserResponse;
    if (!meBody.data?.id) {
      console.warn({ event: "medium_publish_skipped", reason: "no_user_id" });
      return null;
    }
    userId = meBody.data.id;
  } catch (err) {
    console.warn({
      event: "medium_publish_skipped",
      reason: "me_lookup_threw",
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  // Compose the post body. We prepend a small "Originally published at"
  // pointer in addition to the canonicalUrl field — belt and braces.
  const bodyWithPointer = [
    input.bodyMarkdown.trim(),
    "",
    "---",
    "",
    `*Originally published at [${input.canonicalUrl}](${input.canonicalUrl})*.`,
  ].join("\n");

  const payload = {
    title: input.title,
    contentFormat: "markdown",
    content: bodyWithPointer,
    canonicalUrl: input.canonicalUrl,
    tags: input.tags.slice(0, 5),
    publishStatus: "public",
    notifyFollowers: false,
  };

  try {
    const res = await fetch(`${MEDIUM_API}/users/${userId}/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn({
        event: "medium_publish_failed",
        status: res.status,
        body: text.slice(0, 300),
      });
      return null;
    }
    const body = (await res.json()) as MediumPostResponse;
    if (!body.data?.id || !body.data?.url) {
      console.warn({
        event: "medium_publish_failed",
        reason: "missing_fields_in_response",
      });
      return null;
    }
    return { postId: body.data.id, url: body.data.url };
  } catch (err) {
    console.warn({
      event: "medium_publish_failed",
      reason: "fetch_threw",
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

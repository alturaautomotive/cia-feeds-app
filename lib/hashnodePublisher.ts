// Hashnode publisher.
//
// Hashnode uses a GraphQL API at https://gql.hashnode.com. We call the
// `publishPost` mutation, which requires:
//   - publicationId (every Hashnode user has one default publication; for
//     custom-domain publications it's the publication's own id)
//   - title
//   - contentMarkdown
//   - originalArticleURL (their name for canonical_url \u2014 honoured for SEO)
//   - tags: at most 5, each with at least an `id` OR a `slug`+`name`
//
// Token: hashnode.com/settings/developer -> "Generate New Token"
// PublicationId: hashnode.com/settings -> general -> URL has /publication/<id>
//   OR run the `me { publications { edges { node { id, title } } } }` query.
//
// We persist both required env vars:
//   HASHNODE_API_KEY
//   HASHNODE_PUBLICATION_ID

const HASHNODE_API = "https://gql.hashnode.com";

export interface HashnodePublishInput {
  title: string;
  bodyMarkdown: string;
  /** Required for SEO. Points back to ciafeed.com. */
  canonicalUrl: string;
  /** Optional subtitle (Hashnode renders below title). */
  subtitle?: string;
  /** Up to 5 tag slugs, lowercase, hyphen-separated. */
  tagSlugs: string[];
  /** Optional cover image URL. */
  coverImageUrl?: string | null;
}

export interface HashnodePublishResult {
  platform: "hashnode";
  id: string;
  url: string;
  publishedAt: string;
}

interface HashnodeGqlResponse {
  data?: {
    publishPost?: {
      post?: {
        id?: string;
        slug?: string;
        url?: string;
        publishedAt?: string;
      };
    };
  };
  errors?: Array<{ message?: string; extensions?: Record<string, unknown> }>;
}

/**
 * Hashnode tags must be passed by slug. We sanitise free-text tag strings
 * into Hashnode-acceptable slugs and let Hashnode auto-create any that
 * don't exist (their API does this when you pass a tag with only slug+name).
 */
function buildTags(tagSlugs: string[]): Array<{ slug: string; name: string }> {
  return tagSlugs
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2)
    .map((t) => ({
      slug: t.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50),
      // Display name keeps the original casing with title-case fallback.
      name: t
        .split(/[-\s]+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    }))
    .filter((t) => t.slug.length >= 2)
    .slice(0, 5);
}

export async function publishToHashnode(
  input: HashnodePublishInput
): Promise<HashnodePublishResult | null> {
  const token = process.env.HASHNODE_API_KEY;
  const publicationId = process.env.HASHNODE_PUBLICATION_ID;
  if (!token || !publicationId) {
    console.warn({
      event: "hashnode_publish_skipped",
      reason: !token ? "no_token" : "no_publication_id",
    });
    return null;
  }

  const bodyWithPointer = [
    input.bodyMarkdown.trim(),
    "",
    "---",
    "",
    `*Originally published at [${input.canonicalUrl}](${input.canonicalUrl})*.`,
  ].join("\n");

  // Hashnode's publishPost mutation. We use variables to keep the query
  // string small and the input shape readable.
  const query = `
    mutation PublishPost($input: PublishPostInput!) {
      publishPost(input: $input) {
        post {
          id
          slug
          url
          publishedAt
        }
      }
    }
  `;

  const variables = {
    input: {
      publicationId,
      title: input.title,
      contentMarkdown: bodyWithPointer,
      originalArticleURL: input.canonicalUrl,
      ...(input.subtitle ? { subtitle: input.subtitle } : {}),
      tags: buildTags(input.tagSlugs),
      ...(input.coverImageUrl
        ? { coverImageOptions: { coverImageURL: input.coverImageUrl } }
        : {}),
    },
  };

  let res: Response;
  try {
    res = await fetch(HASHNODE_API, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    console.warn({
      event: "hashnode_publish_failed",
      reason: "fetch_threw",
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  let body: HashnodeGqlResponse;
  try {
    body = (await res.json()) as HashnodeGqlResponse;
  } catch {
    console.warn({
      event: "hashnode_publish_failed",
      reason: "invalid_json",
      status: res.status,
    });
    return null;
  }

  if (!res.ok || body.errors) {
    console.warn({
      event: "hashnode_publish_failed",
      status: res.status,
      errors: body.errors?.map((e) => e.message).slice(0, 3),
    });
    return null;
  }

  const post = body.data?.publishPost?.post;
  if (!post?.id || !post?.url) {
    console.warn({
      event: "hashnode_publish_failed",
      reason: "missing_post_in_response",
    });
    return null;
  }

  return {
    platform: "hashnode",
    id: post.id,
    url: post.url,
    publishedAt: post.publishedAt ?? new Date().toISOString(),
  };
}

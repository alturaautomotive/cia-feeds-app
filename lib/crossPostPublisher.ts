// Cross-post fan-out orchestrator.
//
// Replaces the original Medium-only publisher with a multi-platform fan-out
// that calls every supported destination in parallel and aggregates results
// into a single `crossPosts` shape ready to persist on BlogPost.
//
// Why a fan-out instead of a single platform call:
//   - Medium killed self-serve API tokens on 2025-01-01. Any single
//     hardcoded target risks the same fate.
//   - Different platforms reach different audiences. Dev.to indexes well
//     for technical / WhatsApp-API content; Hashnode is stronger for
//     marketing / business content. Running both costs us nothing (each
//     publish is one HTTP call).
//   - Every supported platform honours `canonical_url` (or its equivalent)
//     so SEO authority remains on ciafeed.com regardless of which mirrors
//     are active.
//
// Adding a new platform: write lib/<name>Publisher.ts exposing a function
// that returns Promise<{ platform, id, url, publishedAt } | null>, then
// invoke it inside `publishCrossPosts()` below and append its result.

import { publishToDevto } from "@/lib/devtoPublisher";
import { publishToHashnode } from "@/lib/hashnodePublisher";

export interface CrossPostInput {
  title: string;
  bodyMarkdown: string;
  /** Full URL on our domain. Persisted as canonicalUrl on each platform. */
  canonicalUrl: string;
  /** Free-text tags. Each publisher sanitises to its own rules. */
  tags: string[];
  /** Optional cover image to attach where supported. */
  coverImageUrl?: string | null;
  /** Optional subtitle for platforms that render it. */
  subtitle?: string;
}

export interface CrossPostResult {
  platform: "devto" | "hashnode";
  id: string;
  url: string;
  publishedAt: string;
  status: "published";
}

export interface CrossPostFailure {
  platform: "devto" | "hashnode";
  status: "failed";
  error: string;
}

export type CrossPostOutcome = CrossPostResult | CrossPostFailure;

/**
 * Publish to every configured destination in parallel. Each platform's
 * env vars determine whether it's actually attempted (we don't want a
 * config-error masquerading as a publish failure in the logs).
 */
export async function publishCrossPosts(
  input: CrossPostInput
): Promise<CrossPostOutcome[]> {
  const tasks: Array<Promise<CrossPostOutcome | null>> = [];

  // Dev.to: requires DEVTO_API_KEY. Skipped silently otherwise.
  if (process.env.DEVTO_API_KEY) {
    tasks.push(
      (async (): Promise<CrossPostOutcome | null> => {
        try {
          const r = await publishToDevto({
            title: input.title,
            bodyMarkdown: input.bodyMarkdown,
            canonicalUrl: input.canonicalUrl,
            tags: input.tags,
            coverImageUrl: input.coverImageUrl,
          });
          if (!r) {
            return {
              platform: "devto",
              status: "failed",
              error: "publisher_returned_null",
            };
          }
          return {
            platform: r.platform,
            id: r.id,
            url: r.url,
            publishedAt: r.publishedAt,
            status: "published",
          };
        } catch (err) {
          return {
            platform: "devto",
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })()
    );
  }

  // Hashnode: requires both HASHNODE_API_KEY and HASHNODE_PUBLICATION_ID.
  if (process.env.HASHNODE_API_KEY && process.env.HASHNODE_PUBLICATION_ID) {
    tasks.push(
      (async (): Promise<CrossPostOutcome | null> => {
        try {
          const r = await publishToHashnode({
            title: input.title,
            bodyMarkdown: input.bodyMarkdown,
            canonicalUrl: input.canonicalUrl,
            tagSlugs: input.tags,
            coverImageUrl: input.coverImageUrl,
            subtitle: input.subtitle,
          });
          if (!r) {
            return {
              platform: "hashnode",
              status: "failed",
              error: "publisher_returned_null",
            };
          }
          return {
            platform: r.platform,
            id: r.id,
            url: r.url,
            publishedAt: r.publishedAt,
            status: "published",
          };
        } catch (err) {
          return {
            platform: "hashnode",
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })()
    );
  }

  if (tasks.length === 0) {
    console.log({
      event: "crosspost_no_targets_configured",
      hint: "Set DEVTO_API_KEY and/or HASHNODE_API_KEY+HASHNODE_PUBLICATION_ID to enable cross-post mirroring.",
    });
    return [];
  }

  const settled = await Promise.allSettled(tasks);
  const outcomes: CrossPostOutcome[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) {
      outcomes.push(r.value);
    }
  }

  console.log({
    event: "crosspost_fanout_complete",
    attempted: tasks.length,
    succeeded: outcomes.filter((o) => o.status === "published").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
  });
  return outcomes;
}

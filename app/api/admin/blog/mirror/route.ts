// On-demand cross-post mirror.
//
// Re-runs the cross-post fan-out (currently Dev.to + Hashnode when
// configured) for an existing BlogPost row. Use cases:
//   - A post was published before the fan-out shipped, and we want to
//     mirror it without regenerating it via Gemini.
//   - A platform was disconnected when the original cron ran, and we've
//     now added the credentials \u2014 we just want to fill in the missing
//     mirror without paying for re-generation.
//   - We changed the cross-post strategy (added a new platform) and want
//     to back-fill historical posts.
//
// Auth: CRON_SECRET, same as the bi-weekly cron, because each mirror
// call hits paid third-party APIs.
//
// Pass ?postId=<uuid> OR ?slug=<slug> in the query string. Returns the
// updated crossPosts array.

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publishCrossPosts } from "@/lib/crossPostPublisher";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

function authorized(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  if (!auth || !process.env.CRON_SECRET) return false;
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

function blogUrlFor(slug: string, locale: string): string {
  const base = "https://www.ciafeed.com";
  return locale === "es" ? `${base}/es/blog/${slug}` : `${base}/blog/${slug}`;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const postId = request.nextUrl.searchParams.get("postId");
  const slug = request.nextUrl.searchParams.get("slug");
  if (!postId && !slug) {
    return NextResponse.json(
      { error: "missing_postId_or_slug" },
      { status: 400 }
    );
  }

  const post = postId
    ? await prisma.blogPost.findUnique({ where: { id: postId } })
    : await prisma.blogPost.findUnique({ where: { slug: slug as string } });
  if (!post) {
    return NextResponse.json({ error: "post_not_found" }, { status: 404 });
  }

  const canonicalUrl = blogUrlFor(post.slug, post.locale);
  // Base tags identical to what the cron uses so cross-posted articles
  // surface under the same Dev.to / Hashnode tag taxonomy as future cron
  // runs.
  const baseTags = [
    post.title.split(" ").slice(0, 3).join(" "),
    post.locale === "es" ? "marketing automotriz" : "automotive marketing",
    "whatsapp",
    "dealerships",
    post.locale === "es" ? "hispanos" : "hispanic",
  ].slice(0, 5);

  const outcomes = await publishCrossPosts({
    title: post.title,
    bodyMarkdown: post.bodyMarkdown,
    canonicalUrl,
    tags: baseTags,
    coverImageUrl: post.heroImageUrl,
    subtitle: post.excerpt.slice(0, 140),
  });

  // Merge new outcomes into the existing crossPosts array, keyed by
  // platform: a successful re-mirror replaces a prior failed entry for the
  // same platform; we never delete history except for that overwrite.
  const existing = (post.crossPosts as unknown as Array<{ platform: string }>) ?? [];
  const incomingPlatforms = new Set<string>(outcomes.map((o) => o.platform));
  const kept = existing.filter(
    (e) => !incomingPlatforms.has(e.platform)
  );
  const merged = [...kept, ...outcomes];

  await prisma.blogPost.update({
    where: { id: post.id },
    data: { crossPosts: merged as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({
    ok: true,
    postId: post.id,
    slug: post.slug,
    outcomes,
    storedCrossPosts: merged,
  });
}

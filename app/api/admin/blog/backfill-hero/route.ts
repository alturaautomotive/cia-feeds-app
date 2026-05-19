// Backfill a hero image for an existing BlogPost row.
//
// Two use cases:
//   - The bi-weekly cron's image step soft-failed for some reason (the rest
//     of the pipeline continues regardless) and we want to retrofit a hero.
//   - We changed image-gen models and want to regenerate older posts.
//
// Auth: CRON_SECRET, same as the cron itself, since the operation costs
// money and we don't want unauthed callers spamming OpenAI on our dime.
//
// Pass ?postId=<uuid> OR ?slug=<slug> in the query string. Returns the new
// heroImageUrl or an error describing why we couldn't generate one.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateBlogHero, getLastImageGenError } from "@/lib/blogImage";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

function authorized(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  if (!auth || !process.env.CRON_SECRET) return false;
  return auth === `Bearer ${process.env.CRON_SECRET}`;
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

  const heroImageUrl = await generateBlogHero({
    slug: post.slug,
    title: post.title,
    locale: post.locale === "es" ? "es" : "en",
  });

  if (!heroImageUrl) {
    const diagnostic = getLastImageGenError();
    return NextResponse.json(
      {
        error: "image_generation_failed",
        diagnostic: diagnostic ?? "no_diagnostic_captured",
        hint: "Diagnostic shows the actual OpenAI / Supabase error from this run. Common causes: org needs identity verification for gpt-image-1, OPENAI_API_KEY has expired billing, Supabase Storage bucket policy blocks server-side createBucket calls.",
      },
      { status: 502 }
    );
  }

  await prisma.blogPost.update({
    where: { id: post.id },
    data: { heroImageUrl },
  });

  return NextResponse.json({
    ok: true,
    postId: post.id,
    slug: post.slug,
    heroImageUrl,
  });
}

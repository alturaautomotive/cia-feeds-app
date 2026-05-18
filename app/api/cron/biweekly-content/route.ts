// Bi-weekly content cron.
//
// Schedule (set in vercel.json): "0 14 1,15 * *" — runs at 14:00 UTC on the
// 1st and 15th of every month. That's roughly bi-weekly (sometimes 14 days,
// sometimes 16 — close enough; calendar-day scheduling is simpler than
// every-other-Monday).
//
// Pipeline for each run:
//   1. Pick the next unpublished KeywordPlan row (priority asc, createdAt asc).
//      If none, exit cleanly.
//   2. Generate the blog post with lib/blogGenerator (Gemini 2.5 Pro).
//   3. Slugify and resolve any collision by suffixing -2, -3, ...
//   4. Generate the hero image with lib/blogImage (OpenAI gpt-image-1) and
//      upload to Supabase Storage.
//   5. Persist the BlogPost as `status = "published"` with publishedAt = now.
//      We don't gate on manual review for v1 — the dashboard admin can
//      flip status to "archived" if needed. (Review-queue mode is a one-line
//      change later: change "published" to "review".)
//   6. Mirror to Medium via lib/mediumPublisher with canonicalUrl back to our
//      domain. Update the BlogPost row with mediumPostId/mediumUrl if it
//      succeeded; if Medium is missing/down it logs and continues.
//   7. Send the bi-weekly email blast to all active NewsletterSubscriber rows
//      whose locale matches the post's locale. Subject = post.title, body
//      includes the excerpt and a single primary CTA pointing to the post's
//      landing page (post.landingSlug -> /lp/<slug>). We update emailsSent
//      and each subscriber's lastEmailedAt.
//   8. Mark the KeywordPlan row as published.
//
// Auth: Vercel cron requests carry `Authorization: Bearer <CRON_SECRET>` from
// project settings. We also accept x-vercel-cron header presence for the
// platform-managed crons.
//
// Idempotency: if a KeywordPlan's `publishedAt` is already set, we skip it.
// If the cron is invoked twice in the same window, the second invocation
// finds no unpublished rows and exits cleanly.

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import {
  generateBlogPost,
  BlogGenerationError,
  blogSlugify,
} from "@/lib/blogGenerator";
import { generateBlogHero } from "@/lib/blogImage";
import { publishToMedium } from "@/lib/mediumPublisher";
import { publishCrossPosts } from "@/lib/crossPostPublisher";
import type { Prisma } from "@prisma/client";
import { sendEmail, esc } from "@/lib/email";
import { decryptLeadField } from "@/lib/leadCrypto";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — Gemini Pro + image gen + email blast

function authorized(request: NextRequest): boolean {
  // Vercel's scheduled cron requests include this header.
  if (request.headers.get("x-vercel-cron")) return true;
  // Manual / preview runs use the Bearer token.
  const auth = request.headers.get("authorization");
  if (!auth || !process.env.CRON_SECRET) return false;
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

async function resolveUniqueSlug(base: string): Promise<string> {
  let attempt = base;
  let suffix = 2;
  for (let i = 0; i < 25; i++) {
    const existing = await prisma.blogPost.findUnique({
      where: { slug: attempt },
      select: { id: true },
    });
    if (!existing) return attempt;
    attempt = `${base}-${suffix++}`;
  }
  // Last-resort: append a short random hex.
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

function blogUrlFor(slug: string, locale: string): string {
  const base = "https://www.ciafeed.com";
  return locale === "es" ? `${base}/es/blog/${slug}` : `${base}/blog/${slug}`;
}

function landingUrlFor(slug: string, locale: string): string {
  // /lp/<slug> is the lead-capture funnel; matches the slug used in
  // KeywordPlan.landingSlug. We don't prefix with /es for lp routes because
  // the page itself reads `locale` from the slug naming (e.g.
  // marketing-whatsapp-concesionarios is implicitly Spanish).
  return `https://www.ciafeed.com/lp/${slug}`;
}

interface SendResult {
  attempted: number;
  sent: number;
  failed: number;
}

async function sendBlastForPost(args: {
  postId: string;
  postTitle: string;
  postExcerpt: string;
  postSlug: string;
  postLocale: string;
  landingSlug: string;
}): Promise<SendResult> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { attempted: 0, sent: 0, failed: 0 };
  const resend = new Resend(resendKey);

  // Pull all active subscribers for this locale. We process in batches of 50
  // to keep individual requests well under the function timeout.
  const subs = await prisma.newsletterSubscriber.findMany({
    where: { unsubscribedAt: null, locale: args.postLocale },
    select: {
      id: true,
      email: true,
      name: true,
      locale: true,
      unsubscribeToken: true,
    },
  });

  const blogUrl = blogUrlFor(args.postSlug, args.postLocale);
  const landingUrl = landingUrlFor(args.landingSlug, args.postLocale);
  const isEs = args.postLocale === "es";

  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    const emailPlain = decryptLeadField(sub.email);
    const namePlain = sub.name ? decryptLeadField(sub.name) : "";
    if (!emailPlain) {
      failed++;
      continue;
    }

    const greeting = isEs
      ? `Hola${namePlain ? " " + esc(namePlain) : ""},`
      : `Hi${namePlain ? " " + esc(namePlain) : ""},`;
    const ctaLabel = isEs ? "Lee el playbook" : "Read the playbook";
    const secondaryLabel = isEs
      ? "O agenda una demo de 15 minutos"
      : "Or book a 15-minute demo";
    const closing = isEs ? "Saludos," : "Best,";
    const unsubLine = isEs
      ? `Si ya no quieres recibir estos correos, <a href="https://www.ciafeed.com/api/newsletter/unsubscribe?token=${sub.unsubscribeToken}">cancela tu suscripci\u00f3n aqu\u00ed</a>.`
      : `Don't want these? <a href="https://www.ciafeed.com/api/newsletter/unsubscribe?token=${sub.unsubscribeToken}">Unsubscribe here</a>.`;

    const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; color: #0F172A; line-height: 1.55;">
        <p>${greeting}</p>
        <p style="font-size: 18px; font-weight: 600; margin: 20px 0 8px;">${esc(args.postTitle)}</p>
        <p>${esc(args.postExcerpt)}</p>
        <p style="margin: 28px 0;">
          <a href="${blogUrl}" style="display: inline-block; background: #4338CA; color: white; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: 600;">${ctaLabel}</a>
        </p>
        <p style="font-size: 14px;">
          <a href="${landingUrl}" style="color: #4338CA;">${secondaryLabel}</a>
        </p>
        <p>${closing}<br>Luis Delgado<br>CIAfeeds</p>
        <p style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #64748B;">
          ${unsubLine}
        </p>
      </div>
    `;

    try {
      await sendEmail(resend, {
        from: "Luis at CIAfeeds <hello@ciafeed.com>",
        to: emailPlain,
        subject: args.postTitle,
        html,
        headers: {
          "List-Unsubscribe": `<https://www.ciafeed.com/api/newsletter/unsubscribe?token=${sub.unsubscribeToken}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      sent++;
      await prisma.newsletterSubscriber.update({
        where: { id: sub.id },
        data: { lastEmailedAt: new Date() },
      });
    } catch (err) {
      failed++;
      console.warn({
        event: "biweekly_email_failed",
        subscriberId: sub.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { attempted: subs.length, sent, failed };
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runCron();
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runCron();
}

async function runCron(): Promise<NextResponse> {
  // 1. Pick next unpublished KeywordPlan.
  const plan = await prisma.keywordPlan.findFirst({
    where: { publishedAt: null },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  if (!plan) {
    return NextResponse.json({
      event: "biweekly_no_plan_available",
      message: "No unpublished KeywordPlan rows. Seed more to keep publishing.",
    });
  }

  // 2. Generate the blog post.
  let generated;
  try {
    generated = await generateBlogPost({
      keyword: plan.keyword,
      locale: plan.locale === "es" ? "es" : "en",
      angle: plan.angle,
      landingSlug: plan.landingSlug ?? "whatsapp-marketing-dealerships",
    });
  } catch (err) {
    const reason =
      err instanceof BlogGenerationError ? err.reason : "unknown_error";
    console.error({
      event: "biweekly_generate_failed",
      planId: plan.id,
      keyword: plan.keyword,
      reason,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "generation_failed", reason },
      { status: 502 }
    );
  }

  // 3. Resolve a unique slug.
  const baseSlug = blogSlugify(generated.slug);
  const finalSlug = await resolveUniqueSlug(baseSlug);

  // 4. Hero image (best-effort).
  const heroImageUrl = await generateBlogHero({
    slug: finalSlug,
    title: generated.title,
    locale: plan.locale === "es" ? "es" : "en",
  });

  // 5. Persist the post.
  const landingSlug = plan.landingSlug ?? "whatsapp-marketing-dealerships";
  const created = await prisma.blogPost.create({
    data: {
      slug: finalSlug,
      locale: plan.locale,
      keywordPlanId: plan.id,
      title: generated.title,
      metaDescription: generated.metaDescription,
      excerpt: generated.excerpt,
      bodyMarkdown: generated.bodyMarkdown,
      heroImageUrl,
      landingSlug,
      status: "published",
      publishedAt: new Date(),
      generatedBy: "cron:biweekly-content",
    },
  });

  // 6. Cross-post fan-out (Medium legacy + Dev.to + Hashnode).
  // Each publisher checks its own env vars and skips cleanly if not
  // configured. Medium remains in the list for legacy accounts that still
  // have an integration token from before 2025-01-01.
  const canonicalUrl = blogUrlFor(finalSlug, plan.locale);
  const baseTags = [
    plan.keyword.slice(0, 25),
    plan.locale === "es" ? "marketing automotriz" : "automotive marketing",
    "whatsapp",
    "dealerships",
    plan.locale === "es" ? "hispanos" : "hispanic",
  ].slice(0, 5);
  let mediumUrl: string | null = null;
  let mediumPostId: string | null = null;
  // Medium (legacy token only — self-serve was killed on 2025-01-01).
  if (process.env.MEDIUM_INTEGRATION_TOKEN) {
    try {
      const mediumResult = await publishToMedium({
        title: generated.title,
        bodyMarkdown: generated.bodyMarkdown,
        tags: baseTags,
        canonicalUrl,
      });
      if (mediumResult) {
        mediumUrl = mediumResult.url;
        mediumPostId = mediumResult.postId;
      }
    } catch (err) {
      console.warn({
        event: "biweekly_medium_threw",
        postId: created.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Dev.to + Hashnode (and any future fan-out targets).
  const crossPostOutcomes = await publishCrossPosts({
    title: generated.title,
    bodyMarkdown: generated.bodyMarkdown,
    canonicalUrl,
    tags: baseTags,
    coverImageUrl: heroImageUrl,
    subtitle: generated.excerpt.slice(0, 140),
  });

  // Persist whatever we got from the fan-out + Medium (if any).
  await prisma.blogPost.update({
    where: { id: created.id },
    data: {
      ...(mediumUrl ? { mediumUrl, mediumPostId } : {}),
      crossPosts: crossPostOutcomes as unknown as Prisma.InputJsonValue,
    },
  });

  // 7. Email blast.
  const sendResult = await sendBlastForPost({
    postId: created.id,
    postTitle: generated.title,
    postExcerpt: generated.excerpt,
    postSlug: finalSlug,
    postLocale: plan.locale,
    landingSlug,
  });
  if (sendResult.sent > 0) {
    await prisma.blogPost.update({
      where: { id: created.id },
      data: { emailsSent: { increment: sendResult.sent } },
    });
  }

  // 8. Mark plan published.
  await prisma.keywordPlan.update({
    where: { id: plan.id },
    data: { publishedAt: new Date() },
  });

  return NextResponse.json({
    event: "biweekly_published",
    postId: created.id,
    slug: finalSlug,
    locale: plan.locale,
    heroImage: heroImageUrl ? "yes" : "skipped",
    mediumUrl,
    mediumPostId,
    crossPosts: crossPostOutcomes,
    emails: sendResult,
  });
}

// RSS 2.0 feed for the English blog at /blog/rss.xml
//
// Lets readers subscribe via Feedly, Inoreader, etc., AND lets services
// like Medium's RSS-importer pull in our content automatically without
// any API token. The import is delayed (Medium typically polls every
// 12-48h) but completely hands-off.
//
// Standard: RSS 2.0 with `<atom:link rel="self">` and Dublin Core dates
// for max compatibility with feed readers.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
// 5-minute caching is fine for a blog feed; bots poll on their own schedule.
export const revalidate = 300;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(date: Date): string {
  // RSS 2.0 requires RFC-822 dates.
  return date.toUTCString();
}

export async function GET() {
  const posts = await prisma.blogPost.findMany({
    where: { status: "published", locale: "en" },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: {
      slug: true,
      title: true,
      metaDescription: true,
      excerpt: true,
      heroImageUrl: true,
      publishedAt: true,
      updatedAt: true,
    },
  });

  const lastBuildDate =
    posts[0]?.updatedAt ?? posts[0]?.publishedAt ?? new Date();
  const siteUrl = "https://www.ciafeed.com";
  const feedUrl = `${siteUrl}/blog/rss.xml`;

  const items = posts
    .map((p) => {
      const link = `${siteUrl}/blog/${p.slug}`;
      const pubDate = rfc822(p.publishedAt ?? new Date());
      const description = escapeXml(p.metaDescription || p.excerpt || p.title);
      const imageBlock = p.heroImageUrl
        ? `<enclosure url="${escapeXml(p.heroImageUrl)}" type="image/png" />`
        : "";
      return `
        <item>
          <title>${escapeXml(p.title)}</title>
          <link>${link}</link>
          <guid isPermaLink="true">${link}</guid>
          <pubDate>${pubDate}</pubDate>
          <description>${description}</description>
          ${imageBlock}
        </item>
      `.trim();
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>CIAfeeds Blog</title>
    <link>${siteUrl}/blog</link>
    <description>WhatsApp marketing, Meta Catalog feeds, and Hispanic auto marketing playbooks for car dealerships.</description>
    <language>en-US</language>
    <lastBuildDate>${rfc822(lastBuildDate)}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}

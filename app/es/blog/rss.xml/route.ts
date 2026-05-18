// RSS 2.0 feed for the Spanish blog at /es/blog/rss.xml. Mirror of the
// English feed at /blog/rss.xml, filtered to locale='es'.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
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
  return date.toUTCString();
}

export async function GET() {
  const posts = await prisma.blogPost.findMany({
    where: { status: "published", locale: "es" },
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
  const feedUrl = `${siteUrl}/es/blog/rss.xml`;

  const items = posts
    .map((p) => {
      const link = `${siteUrl}/es/blog/${p.slug}`;
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
    <title>CIAfeeds Blog (Espa\u00f1ol)</title>
    <link>${siteUrl}/es/blog</link>
    <description>Marketing en WhatsApp, feeds de Cat\u00e1logo de Meta y estrategias de marketing automotriz para hispanos en Estados Unidos.</description>
    <language>es-US</language>
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

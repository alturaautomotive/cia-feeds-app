import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantBySlug } from "@/lib/tenant";

/**
 * Per-tenant sitemap. Includes the home, inventory/services index, and every
 * vehicle/listing detail page.
 *
 * Cached at the edge for 1 hour; updates propagate within the next crawl
 * cycle (Google typically refetches sitemaps daily).
 */
export const revalidate = 3600;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Build origin from the actual request, so it works whether the visitor is
  // on the subdomain, the custom domain, or the path-based URL.
  const requestHost = request.headers.get("host") ?? "www.ciafeed.com";
  const protocol = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = `${protocol}://${requestHost}`;

  // When served via the path-based URL we need to keep the /:slug prefix.
  const baseInUrl = requestHost === "www.ciafeed.com" || requestHost === "ciafeed.com"
    ? `/${tenant.slug}`
    : "";

  const urls: { loc: string; lastmod?: string; changefreq: string; priority: number }[] = [
    { loc: `${origin}${baseInUrl}/`, changefreq: "daily", priority: 1.0 },
    {
      loc: `${origin}${baseInUrl}/${tenant.vertical === "automotive" ? "vehicles" : "services"}`,
      changefreq: "daily",
      priority: 0.9,
    },
    { loc: `${origin}${baseInUrl}/contact`, changefreq: "monthly", priority: 0.6 },
  ];

  if (tenant.vertical === "automotive") {
    const vehicles = await prisma.vehicle.findMany({
      where: {
        dealerId: tenant.id,
        archivedAt: null,
        urlStatus: "active",
        scrapeStatus: { not: "failed" },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5000, // cap so sitemap stays under Google's 50k/file limit
    });
    for (const v of vehicles) {
      urls.push({
        loc: `${origin}${baseInUrl}/vehicles/${v.id}`,
        lastmod: v.createdAt.toISOString(),
        changefreq: "weekly",
        priority: 0.7,
      });
    }
  } else {
    const listings = await prisma.listing.findMany({
      where: {
        dealerId: tenant.id,
        archivedAt: null,
        publishStatus: { in: ["published", "ready_to_publish", "validated"] },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    for (const l of listings) {
      urls.push({
        loc: `${origin}${baseInUrl}/services/${l.id}`,
        lastmod: l.createdAt.toISOString(),
        changefreq: "weekly",
        priority: 0.7,
      });
    }
  }

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls.map(
      (u) =>
        `<url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
    ),
    `</urlset>`,
  ].join("\n");

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

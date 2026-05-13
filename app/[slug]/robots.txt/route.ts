import { NextRequest, NextResponse } from "next/server";
import { getTenantBySlug } from "@/lib/tenant";

/**
 * Per-tenant robots.txt with a sitemap pointer.
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

  const requestHost = request.headers.get("host") ?? "www.ciafeed.com";
  const protocol = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = `${protocol}://${requestHost}`;
  const baseInUrl =
    requestHost === "www.ciafeed.com" || requestHost === "ciafeed.com"
      ? `/${tenant.slug}`
      : "";

  const body = [
    `User-agent: *`,
    `Allow: /`,
    ``,
    `Sitemap: ${origin}${baseInUrl}/sitemap.xml`,
    ``,
  ].join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

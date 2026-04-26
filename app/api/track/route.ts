import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { decryptToken, graphFetch } from "@/lib/meta";

export async function POST(request: NextRequest) {
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const rl = rateLimit(`track:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { pixelId, eventName, data, dealerId } = body as Record<string, unknown>;

  if (!pixelId || typeof pixelId !== "string" || !eventName || typeof eventName !== "string" || !dealerId || typeof dealerId !== "string") {
    return NextResponse.json({ error: "pixelId, eventName, and dealerId are required" }, { status: 400 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { metaAccessToken: true, metaPixelId: true },
  });

  if (!dealer) {
    return NextResponse.json({ error: "dealer_not_found" }, { status: 400 });
  }

  if (pixelId !== dealer.metaPixelId) {
    return NextResponse.json({ error: 'pixelId_mismatch' }, { status: 400 });
  }

  if (!dealer.metaAccessToken && !process.env.META_PUBLIC_ACCESS_TOKEN) {
    return NextResponse.json({ error: "missing_meta_credentials" }, { status: 400 });
  }

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        custom_data: data ?? {},
      },
    ],
  };

  try {
    const token = dealer.metaAccessToken
      ? decryptToken(dealer.metaAccessToken)
      : process.env.META_PUBLIC_ACCESS_TOKEN!;

    const res = await graphFetch(
      `/${encodeURIComponent(pixelId)}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      token
    );

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[track] Meta CAPI error:", res.status, errBody);
      return NextResponse.json({ error: "meta_api_error", status: res.status }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[track] Meta CAPI request failed:", err);
    return NextResponse.json({ error: "meta_request_failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { durableRateLimit } from "@/lib/rateLimit";
import { decryptToken, graphFetch } from "@/lib/meta";
import { verifyTrackingSignature, TRACKING_SIGNATURE_HEADER } from "@/lib/trackingSignature";

/**
 * Public Conversions API proxy.
 *
 * Security layers (SECURITY_AUDIT.md F-2.6 + F-5.2):
 *  1. Durable per-IP rate limit (5/min)
 *  2. HMAC signature verification using the dealer's trackingSecret
 *     - When TRACK_REQUIRE_SIGNATURE=true, unsigned requests are rejected.
 *     - During grace period (default), unsigned requests succeed but log
 *       `unsigned_track` so we can quantify adoption before flipping.
 *  3. pixelId-belongs-to-dealer check (existing)
 */
export async function POST(request: NextRequest) {
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const rl = await durableRateLimit(`track:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }

  // We need the raw body bytes to verify the signature. Buffer once, parse from there.
  const rawBody = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { pixelId, eventName, data, dealerId } = body as Record<string, unknown>;

  if (!pixelId || typeof pixelId !== "string" || !eventName || typeof eventName !== "string" || !dealerId || typeof dealerId !== "string") {
    return NextResponse.json({ error: "pixelId, eventName, and dealerId are required" }, { status: 400 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      metaAccessToken: true,
      metaPixelId: true,
      trackingSecret: true,
      active: true,
      deletedAt: true,
    },
  });

  if (!dealer || !dealer.active || dealer.deletedAt) {
    return NextResponse.json({ error: "dealer_not_found" }, { status: 400 });
  }

  if (pixelId !== dealer.metaPixelId) {
    return NextResponse.json({ error: "pixelId_mismatch" }, { status: 400 });
  }

  // F-2.6: HMAC verification.
  const signatureHeader = request.headers.get(TRACKING_SIGNATURE_HEADER);
  const signatureValid = verifyTrackingSignature(rawBody, signatureHeader, dealer.trackingSecret);

  const requireSignature = process.env.TRACK_REQUIRE_SIGNATURE === "true";

  if (!signatureValid) {
    if (requireSignature) {
      console.warn({
        event: "track_signature_invalid_rejected",
        dealerId,
        hasHeader: !!signatureHeader,
        hasSecret: !!dealer.trackingSecret,
      });
      return NextResponse.json({ error: "signature_required_or_invalid" }, { status: 401 });
    }
    console.warn({
      event: "unsigned_track",
      dealerId,
      hasHeader: !!signatureHeader,
      hasSecret: !!dealer.trackingSecret,
      ip,
    });
    // Allow during grace period.
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

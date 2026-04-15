import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { checkSubscription } from "@/lib/checkSubscription";
import { decrypt } from "@/lib/crypto";
import * as dns from "node:dns/promises";
import * as net from "node:net";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ciafeeds.com";

/** Returns true if the IP address belongs to a private or reserved range. */
function isPrivateIP(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (link-local / cloud metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0/8
    if (parts[0] === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique-local
    if (normalized.startsWith("fe80")) return true; // link-local
    if (normalized.startsWith("::ffff:")) {
      const v4 = normalized.slice(7);
      if (net.isIPv4(v4)) return isPrivateIP(v4);
    }
    return false;
  }
  return true; // unrecognised format → reject
}

/**
 * Validates that imageUrl is safe to fetch server-side.
 * Requires https, rejects private/reserved IPs (including after DNS resolution).
 */
async function validateImageUrl(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "invalid URL";
  }

  if (parsed.protocol !== "https:") {
    return "only https URLs are allowed";
  }

  const hostname = parsed.hostname;

  // Block localhost aliases
  if (
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  ) {
    return "localhost URLs are not allowed";
  }

  // If hostname is an IP literal, check directly
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      return "private/reserved IP addresses are not allowed";
    }
    return null;
  }

  // DNS-resolve to catch private targets behind public hostnames
  try {
    const addresses = await dns.resolve4(hostname);
    for (const addr of addresses) {
      if (isPrivateIP(addr)) {
        return "URL resolves to a private/reserved IP address";
      }
    }
  } catch {
    return "could not resolve hostname";
  }

  return null; // valid
}

/**
 * POST /api/fb/ads — Uploads an image, creates an ad creative, and creates an ad.
 * Body: { adSetId, headline, body, callToAction, imageUrl }
 * Returns: { adId }
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isSubscribed = await checkSubscription(dealerId);
  if (!isSubscribed) {
    return NextResponse.json({ error: "subscription_required" }, { status: 402 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { metaAccessToken: true, fbPageId: true, websiteUrl: true },
  });

  const encryptedToken = dealer?.metaAccessToken;
  if (!encryptedToken) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 400 });
  }

  if (!dealer?.fbPageId) {
    return NextResponse.json({ error: "meta_page_not_connected" }, { status: 400 });
  }

  const accessToken = decrypt(encryptedToken);

  let reqBody: {
    adSetId?: string;
    headline?: string;
    body?: string;
    callToAction?: string;
    imageUrl?: string;
  };
  try {
    reqBody = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { adSetId, headline, body: adBody, callToAction, imageUrl } = reqBody;
  if (!adSetId || !headline || !adBody || !callToAction || !imageUrl) {
    return NextResponse.json(
      {
        error: "missing_fields",
        required: ["adSetId", "headline", "body", "callToAction", "imageUrl"],
      },
      { status: 400 }
    );
  }

  // Validate imageUrl to prevent SSRF
  const urlError = await validateImageUrl(imageUrl);
  if (urlError) {
    return NextResponse.json(
      { error: "invalid_image_url", detail: urlError },
      { status: 400 }
    );
  }

  const linkUrl = dealer.websiteUrl ?? APP_URL;

  try {
    // Step 0 — Derive ad account ID from the ad set
    const adSetRes = await fetch(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(adSetId)}?fields=account_id`,
      { headers: { 'Authorization': 'Bearer ' + accessToken } }
    );
    if (!adSetRes.ok) {
      console.error({ event: "fb_adset_lookup_failed", status: adSetRes.status });
      return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
    }
    const adSetData = (await adSetRes.json()) as { account_id?: string };
    const rawAccountId = adSetData.account_id;
    if (!rawAccountId) {
      console.error({ event: "fb_adset_lookup_failed", detail: "no account_id returned" });
      return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
    }
    const adAccountId = rawAccountId.startsWith("act_") ? rawAccountId : `act_${rawAccountId}`;

    // Step 1 — Upload image to ad account
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.error({ event: "fb_image_fetch_failed", status: imageResponse.status });
      return NextResponse.json({ error: "image_fetch_failed" }, { status: 400 });
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    const formData = new FormData();
    formData.append("access_token", accessToken);
    formData.append("filename", new Blob([imageBuffer], { type: "image/jpeg" }), "ad_image.jpg");

    const uploadRes = await fetch(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(adAccountId)}/adimages`,
      { method: "POST", body: formData }
    );

    if (!uploadRes.ok) {
      console.error({ event: "fb_image_upload_failed", status: uploadRes.status });
      return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
    }

    const uploadData = (await uploadRes.json()) as {
      images?: Record<string, { hash?: string }>;
    };
    const imageHash = Object.values(uploadData.images ?? {})[0]?.hash;
    if (!imageHash) {
      console.error({ event: "fb_image_upload_failed", detail: "no hash returned" });
      return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
    }

    // Step 2 — Create ad creative
    const creativeRes = await fetch(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(
        adAccountId
      )}/adcreatives`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + accessToken },
        body: JSON.stringify({
          name: headline,
          object_story_spec: {
            page_id: dealer.fbPageId,
            link_data: {
              message: adBody,
              headline,
              image_hash: imageHash,
              link: linkUrl,
              call_to_action: {
                type: callToAction,
                value: { link: linkUrl },
              },
            },
          },
        }),
      }
    );

    if (!creativeRes.ok) {
      console.error({ event: "fb_creative_create_failed", status: creativeRes.status });
      return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
    }

    const creativeData = (await creativeRes.json()) as { id?: string };
    const creativeId = creativeData.id;
    if (!creativeId) {
      console.error({ event: "fb_creative_create_failed", detail: "no id returned" });
      return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
    }

    // Step 3 — Create ad
    const adRes = await fetch(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(
        adSetId
      )}/ads`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + accessToken },
        body: JSON.stringify({
          name: headline,
          adset_id: adSetId,
          creative: { creative_id: creativeId },
          status: "PAUSED",
        }),
      }
    );

    if (!adRes.ok) {
      console.error({ event: "fb_ad_create_failed", status: adRes.status });
      return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
    }

    const adData = (await adRes.json()) as { id?: string };
    const adId = adData.id;
    if (!adId) {
      console.error({ event: "fb_ad_create_failed", detail: "no id returned" });
      return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
    }

    return NextResponse.json({ adId });
  } catch (err) {
    console.error({
      event: "fb_ads_error",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
  }
}

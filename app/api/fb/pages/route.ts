import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { checkSubscription } from "@/lib/checkSubscription";

async function authGuard(): Promise<
  | { ok: true; dealerId: string }
  | { ok: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const isSubscribed = await checkSubscription(dealerId);
  if (!isSubscribed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "subscription_required" },
        { status: 402 }
      ),
    };
  }
  return { ok: true, dealerId };
}

/**
 * GET /api/fb/pages — Lists the Facebook Pages the connected dealer has
 * access to so they can explicitly pick the Page whose id should be written
 * to the fb_page_id column of the Meta feed CSV.
 */
export async function GET() {
  const guard = await authGuard();
  if (!guard.ok) return guard.response;

  const dealer = await prisma.dealer.findUnique({
    where: { id: guard.dealerId },
    select: { metaAccessToken: true },
  });

  const accessToken = dealer?.metaAccessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name&access_token=${encodeURIComponent(
        accessToken
      )}`
    );
    if (!res.ok) {
      console.error({
        event: "fb_pages_list_failed",
        status: res.status,
      });
      return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
    }
    const data = (await res.json()) as {
      data?: Array<{ id?: string; name?: string }>;
    };
    const pages = (data.data ?? [])
      .filter((p): p is { id: string; name: string } =>
        typeof p.id === "string" && typeof p.name === "string"
      )
      .map((p) => ({ id: p.id, name: p.name }));

    return NextResponse.json({ pages });
  } catch (err) {
    console.error({
      event: "fb_pages_list_error",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
  }
}

/**
 * POST /api/fb/pages — Persists the Facebook Page the dealer explicitly
 * chose as their fb_page_id.
 * Body: { pageId: string }
 */
export async function POST(request: NextRequest) {
  const guard = await authGuard();
  if (!guard.ok) return guard.response;

  let body: { pageId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { pageId } = body;
  if (!pageId || typeof pageId !== "string") {
    return NextResponse.json({ error: "pageId_required" }, { status: 400 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: guard.dealerId },
    select: { metaAccessToken: true },
  });
  const accessToken = dealer?.metaAccessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 400 });
  }

  // Verify the selected page is actually one the dealer has access to, so we
  // never persist an arbitrary/attacker-supplied id.
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id&access_token=${encodeURIComponent(
        accessToken
      )}`
    );
    if (!res.ok) {
      return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
    }
    const data = (await res.json()) as {
      data?: Array<{ id?: string }>;
    };
    const ownedIds = new Set(
      (data.data ?? [])
        .map((p) => p.id)
        .filter((id): id is string => typeof id === "string")
    );
    if (!ownedIds.has(pageId)) {
      return NextResponse.json({ error: "page_not_owned" }, { status: 403 });
    }
  } catch (err) {
    console.error({
      event: "fb_pages_verify_error",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
  }

  await prisma.dealer.update({
    where: { id: guard.dealerId },
    data: { fbPageId: pageId },
  });

  return NextResponse.json({ pageId });
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { checkSubscription } from "@/lib/checkSubscription";
import { decrypt } from "@/lib/crypto";

/**
 * GET /api/fb/businesses — Returns the Meta Business Managers the
 * connected dealer has access to. Requires a valid metaAccessToken.
 */
export async function GET() {
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
    select: { metaAccessToken: true },
  });

  const encryptedToken = dealer?.metaAccessToken;
  if (!encryptedToken) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 400 });
  }

  const accessToken = decrypt(encryptedToken);

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=businesses{id,name}&access_token=${encodeURIComponent(
        accessToken
      )}`
    );
    if (!res.ok) {
      console.error({
        event: "fb_businesses_fetch_failed",
        status: res.status,
      });
      return NextResponse.json(
        { error: "meta_api_error" },
        { status: 502 }
      );
    }
    const data = (await res.json()) as {
      businesses?: { data?: Array<{ id?: string; name?: string }> };
    };
    const businesses = (data.businesses?.data ?? [])
      .filter((b): b is { id: string; name: string } =>
        typeof b.id === "string" && typeof b.name === "string"
      )
      .map((b) => ({ id: b.id, name: b.name }));

    return NextResponse.json({ businesses });
  } catch (err) {
    console.error({
      event: "fb_businesses_error",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
  }
}

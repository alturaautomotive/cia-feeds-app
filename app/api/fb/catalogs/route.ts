import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { checkSubscription } from "@/lib/checkSubscription";
import { decrypt } from "@/lib/crypto";

const VERTICAL_TO_META: Record<string, string> = {
  automotive: "automotive_models",
  realestate: "home_listings",
  services: "services",
};

async function loadDealerToken(dealerId: string): Promise<string | null> {
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { metaAccessToken: true },
  });
  if (!dealer?.metaAccessToken) return null;
  return decrypt(dealer.metaAccessToken);
}

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
 * GET /api/fb/catalogs?businessId=... — Lists the product catalogs owned by
 * the given Meta Business Manager.
 */
export async function GET(request: NextRequest) {
  const guard = await authGuard();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json(
      { error: "businessId_required" },
      { status: 400 }
    );
  }

  const accessToken = await loadDealerToken(guard.dealerId);
  if (!accessToken) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(
        businessId
      )}/owned_product_catalogs?fields=id,name&access_token=${encodeURIComponent(
        accessToken
      )}`
    );
    if (!res.ok) {
      console.error({
        event: "fb_catalogs_list_failed",
        status: res.status,
      });
      return NextResponse.json(
        { error: "meta_api_error" },
        { status: 502 }
      );
    }
    const data = (await res.json()) as {
      data?: Array<{ id?: string; name?: string }>;
    };
    const catalogs = (data.data ?? [])
      .filter((c): c is { id: string; name: string } =>
        typeof c.id === "string" && typeof c.name === "string"
      )
      .map((c) => ({ id: c.id, name: c.name }));

    return NextResponse.json({ catalogs });
  } catch (err) {
    console.error({
      event: "fb_catalogs_list_error",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
  }
}

/**
 * POST /api/fb/catalogs — Selects an existing catalog OR creates a new one.
 * Body: { businessId, catalogId? , catalogName? }
 */
export async function POST(request: NextRequest) {
  const guard = await authGuard();
  if (!guard.ok) return guard.response;

  let body: {
    businessId?: string;
    catalogId?: string;
    catalogName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { businessId, catalogId, catalogName } = body;
  if (!businessId) {
    return NextResponse.json(
      { error: "businessId_required" },
      { status: 400 }
    );
  }
  if (!catalogId && !catalogName) {
    return NextResponse.json(
      { error: "catalogId_or_catalogName_required" },
      { status: 400 }
    );
  }

  const accessToken = await loadDealerToken(guard.dealerId);
  if (!accessToken) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 400 });
  }

  // Case 1 — select existing catalog
  if (catalogId) {
    await prisma.dealer.update({
      where: { id: guard.dealerId },
      data: {
        metaBusinessId: businessId,
        metaCatalogId: catalogId,
      },
    });
    return NextResponse.json({ catalogId });
  }

  // Case 2 — create new catalog
  try {
    const dealer = await prisma.dealer.findUnique({
      where: { id: guard.dealerId },
      select: { vertical: true },
    });
    const metaVertical =
      VERTICAL_TO_META[dealer?.vertical ?? "automotive"] ?? "automotive_models";

    const createRes = await fetch(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(
        businessId
      )}/owned_product_catalogs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: catalogName,
          vertical: metaVertical,
          access_token: accessToken,
        }),
      }
    );
    const createData = (await createRes.json()) as {
      id?: string;
      error?: { code?: number; message?: string; type?: string };
    };

    if (!createRes.ok || !createData.id) {
      const errMsg = createData.error?.message ?? "";
      const errCode = createData.error?.code;
      console.error({
        event: "fb_catalog_create_failed",
        status: createRes.status,
        code: errCode,
        message: errMsg,
      });

      // Common TOS / permission signals from Graph API
      const tosSignals = [
        "terms",
        "tos",
        "commerce",
        "accept",
        "merchant agreement",
      ];
      const looksLikeTos =
        errCode === 200 ||
        tosSignals.some((s) => errMsg.toLowerCase().includes(s));

      if (looksLikeTos) {
        return NextResponse.json(
          { error: "catalog_tos_required" },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "meta_api_error", detail: errMsg },
        { status: 502 }
      );
    }

    await prisma.dealer.update({
      where: { id: guard.dealerId },
      data: {
        metaBusinessId: businessId,
        metaCatalogId: createData.id,
      },
    });

    return NextResponse.json({ catalogId: createData.id });
  } catch (err) {
    console.error({
      event: "fb_catalog_create_error",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
  }
}

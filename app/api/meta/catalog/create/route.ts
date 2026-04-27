import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authGuard, loadDealerToken, graphFetch } from "@/lib/meta";
import { VERTICAL_META_TYPE, type Vertical } from "@/lib/verticals";
import { CATALOG_OWNERSHIP } from "@/lib/catalogOwnership";
import { durableRateLimit } from "@/lib/rateLimit";
import { metaCatalogCreateSchema } from "@/lib/requestSchemas";

/**
 * POST /api/meta/catalog/create — Creates a new catalog under the business.
 * Body: { businessId, catalogName }
 */
export async function POST(request: NextRequest) {
  const guard = await authGuard();
  if (!guard.ok) return guard.response;

  const rl = await durableRateLimit(`meta-catalog-create:${guard.dealerId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = metaCatalogCreateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { businessId, catalogName } = parsed.data;

  const accessToken = await loadDealerToken(guard.dealerId);
  if (!accessToken) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 400 });
  }

  try {
    const dealer = await prisma.dealer.findUnique({
      where: { id: guard.dealerId },
      select: { vertical: true },
    });
    const metaVertical =
      VERTICAL_META_TYPE[(dealer?.vertical ?? "automotive") as Vertical] ?? "automotive_models";

    const createRes = await graphFetch(
      `/${encodeURIComponent(businessId)}/owned_product_catalogs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: catalogName,
          vertical: metaVertical,
        }),
      },
      accessToken
    );
    const createData = (await createRes.json()) as {
      id?: string;
      error?: { code?: number; message?: string; type?: string };
    };

    if (!createRes.ok || !createData.id) {
      const errMsg = createData.error?.message ?? "";
      const errCode = createData.error?.code;
      console.error({
        event: "meta_catalog_create_failed",
        status: createRes.status,
        code: errCode,
        message: errMsg,
      });

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
        metaCatalogOwnership: CATALOG_OWNERSHIP.CREATED,
        metaConnectedAt: new Date(),
      },
    });

    return NextResponse.json({ catalogId: createData.id });
  } catch (err) {
    console.error({
      event: "meta_catalog_create_error",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
  }
}

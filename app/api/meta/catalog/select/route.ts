import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authGuard, loadDealerToken } from "@/lib/meta";
import { CATALOG_OWNERSHIP } from "@/lib/catalogOwnership";
import { durableRateLimit } from "@/lib/rateLimit";
import { metaCatalogSelectSchema } from "@/lib/requestSchemas";

/**
 * POST /api/meta/catalog/select — Selects an existing catalog for the dealer.
 * Body: { businessId, catalogId }
 */
export async function POST(request: NextRequest) {
  const guard = await authGuard();
  if (!guard.ok) return guard.response;

  const rl = await durableRateLimit(`meta-catalog-select:${guard.dealerId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = metaCatalogSelectSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { businessId, catalogId } = parsed.data;

  const accessToken = await loadDealerToken(guard.dealerId);
  if (!accessToken) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 400 });
  }

  await prisma.dealer.update({
    where: { id: guard.dealerId },
    data: {
      metaBusinessId: businessId,
      metaCatalogId: catalogId,
      metaCatalogOwnership: CATALOG_OWNERSHIP.SELECTED,
      metaConnectedAt: new Date(),
    },
  });

  return NextResponse.json({ catalogId });
}

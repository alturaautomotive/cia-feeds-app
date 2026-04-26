import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authGuard, loadDealerToken } from "@/lib/meta";
import { CATALOG_OWNERSHIP } from "@/lib/catalogOwnership";

/**
 * POST /api/meta/catalog/select — Selects an existing catalog for the dealer.
 * Body: { businessId, catalogId }
 */
export async function POST(request: NextRequest) {
  const guard = await authGuard();
  if (!guard.ok) return guard.response;

  let body: { businessId?: string; catalogId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { businessId, catalogId } = body;
  if (!businessId) {
    return NextResponse.json(
      { error: "businessId_required" },
      { status: 400 }
    );
  }
  if (!catalogId) {
    return NextResponse.json(
      { error: "catalogId_required" },
      { status: 400 }
    );
  }

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

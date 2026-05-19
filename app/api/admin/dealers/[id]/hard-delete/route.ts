// DELETE /api/admin/dealers/[id]/hard-delete
//
// Irreversible. Cascades through 15+ child tables. Confirmation gate:
// the dealer's slug must be provided in the body as `confirmSlug`, AND it
// must match exactly. This is the same pattern GitHub uses for repo
// deletion ("type the repo name to confirm") and prevents a fat-fingered
// click from destroying tenant data.
//
// Body: { confirmSlug: string, reason?: string }

import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hardDeleteDealer } from "@/lib/accountManagement";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuard("manage_accounts");
  if (!guard.ok) return guard.response!;

  const { id: dealerId } = await params;

  let body: { confirmSlug?: unknown; reason?: unknown } = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const confirmSlug =
    typeof body.confirmSlug === "string" ? body.confirmSlug.trim() : "";
  const reason =
    typeof body.reason === "string" ? body.reason.slice(0, 500) : null;

  if (!confirmSlug) {
    return NextResponse.json(
      {
        error: "confirmation_required",
        detail:
          "Pass `confirmSlug` in the body matching the dealer's slug to confirm hard delete.",
      },
      { status: 400 }
    );
  }

  // Verify slug matches before we do anything destructive.
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { slug: true, name: true },
  });
  if (!dealer) {
    return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
  }
  if (dealer.slug !== confirmSlug) {
    return NextResponse.json(
      {
        error: "slug_mismatch",
        detail: `Confirmation slug "${confirmSlug}" does not match dealer slug.`,
      },
      { status: 400 }
    );
  }

  try {
    const result = await hardDeleteDealer({
      dealerId,
      actor: { email: guard.email, role: guard.role },
      reason,
    });
    return NextResponse.json({
      ok: true,
      ...result,
      dealerName: dealer.name,
      dealerSlug: dealer.slug,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error({
      event: "admin_hard_delete_failed",
      dealerId,
      message: msg,
    });
    return NextResponse.json(
      { error: "internal_error", detail: msg.slice(0, 300) },
      { status: 500 }
    );
  }
}

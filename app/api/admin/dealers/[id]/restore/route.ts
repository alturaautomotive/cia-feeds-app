// POST /api/admin/dealers/[id]/restore
//
// Undo a suspend within the 30-day grace window. Sets active=true and
// clears deletedAt. Does NOT restart the Stripe subscription (see
// lib/accountManagement.ts module header for rationale).

import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/auth";
import { restoreDealer } from "@/lib/accountManagement";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuard("manage_accounts");
  if (!guard.ok) return guard.response!;

  const { id: dealerId } = await params;

  try {
    const result = await restoreDealer({
      dealerId,
      actor: { email: guard.email, role: guard.role },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "dealer_not_found") {
      return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
    }
    console.error({ event: "admin_restore_failed", dealerId, message: msg });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

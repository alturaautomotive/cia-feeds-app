// POST /api/admin/dealers/[id]/suspend
//
// Soft-delete a dealer (sets active=false + deletedAt=now) and cancel
// their Stripe subscription at period end. Reversible via the restore
// endpoint until the 30-day data-retention cron hard-deletes.
//
// Body (optional): { reason?: string }
//   reason is stored in the audit log so a future you can remember why.

import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/auth";
import { suspendDealer } from "@/lib/accountManagement";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuard("manage_accounts");
  if (!guard.ok) return guard.response!;

  const { id: dealerId } = await params;
  let body: { reason?: unknown } = {};
  try {
    body = (await request.json()) as { reason?: unknown };
  } catch {
    // empty body is fine
  }
  const reason =
    typeof body.reason === "string" ? body.reason.slice(0, 500) : null;

  try {
    const result = await suspendDealer({
      dealerId,
      actor: { email: guard.email, role: guard.role },
      reason,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "dealer_not_found") {
      return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
    }
    console.error({ event: "admin_suspend_failed", dealerId, message: msg });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

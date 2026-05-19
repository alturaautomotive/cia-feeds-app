// DELETE /api/admin/dealers/[id]/team/[teamUserId]
//
// Remove a team member (TeamUser row) from a dealer. Used by admin support
// when a dealer reports a user that should no longer have access (former
// employee, mis-invited, etc.) and the dealer hasn't done it themselves.
//
// Notes:
//   - Does not delete the underlying User account. Other dealer teams may
//     still reference this user.
//   - Cancels any pending TeamInvite rows for the same email + dealer so a
//     stale invite link doesn't re-add them.
//   - Audit-logged.

import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; teamUserId: string }> }
) {
  const guard = await adminGuard("manage_accounts");
  if (!guard.ok) return guard.response!;

  const { id: dealerId, teamUserId } = await params;

  const teamUser = await prisma.teamUser.findFirst({
    where: { id: teamUserId, dealerId },
    include: {
      dealer: { select: { name: true, slug: true } },
    },
  });
  if (!teamUser) {
    return NextResponse.json(
      { error: "team_user_not_found" },
      { status: 404 }
    );
  }

  const userEmail = teamUser.email;

  await prisma.$transaction(async (tx) => {
    await tx.teamUser.delete({ where: { id: teamUserId } });
    // Cancel any pending invites for the same email at this dealer so a
    // stale link doesn't let them back in. TeamInvite rows are deleted on
    // acceptance, so any remaining row for this email + dealer is pending.
    await tx.teamInvite.deleteMany({
      where: { dealerId, email: userEmail },
    });
  });

  await writeAuditLog({
    action: "team_member_removed",
    actorEmail: guard.email,
    actorRole: guard.role,
    actorDealerId: null,
    targetDealerId: dealerId,
    beforeState: {
      teamUserId,
      role: teamUser.role,
      memberEmail: userEmail,
    },
    afterState: { removed: true },
    metadata: {
      dealerName: teamUser.dealer.name,
      dealerSlug: teamUser.dealer.slug,
    },
  });

  return NextResponse.json({ ok: true, removed: teamUserId });
}

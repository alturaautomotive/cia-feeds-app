import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getEffectiveDealerContext } from "@/lib/impersonation";
import { sendTeamInviteEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Editors cannot resend invites
  if (session.user.teamUser?.role === "editor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { effectiveDealerId } = await getEffectiveDealerContext();
  if (!effectiveDealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const memberId = typeof b.memberId === "string" && b.memberId.trim() ? b.memberId.trim() : null;
  const inviteId = typeof b.inviteId === "string" && b.inviteId.trim() ? b.inviteId.trim() : null;

  if (memberId && inviteId) {
    return NextResponse.json({ error: "exactly_one_id_required" }, { status: 400 });
  }
  if (!memberId && !inviteId) {
    return NextResponse.json({ error: "exactly_one_id_required" }, { status: 400 });
  }

  let email: string;
  let role: string;
  let subAccountId: string | null;

  if (memberId) {
    const member = await prisma.teamUser.findFirst({
      where: { id: memberId, dealerId: effectiveDealerId },
    });
    if (!member) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (member.passwordHash) {
      return NextResponse.json({ error: "already_active" }, { status: 400 });
    }
    email = member.email;
    role = member.role;
    subAccountId = member.subAccountId;
  } else {
    const invite = await prisma.teamInvite.findFirst({
      where: { id: inviteId!, dealerId: effectiveDealerId },
    });
    if (!invite) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    email = invite.email;
    role = invite.role;
    subAccountId = invite.subAccountId;
  }

  // Clear stale tokens for this email+dealer
  await prisma.teamInvite.deleteMany({
    where: { email, dealerId: effectiveDealerId },
  });

  // Create fresh invite
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.teamInvite.create({
    data: {
      token,
      email,
      dealerId: effectiveDealerId,
      subAccountId,
      role,
      expiresAt,
    },
  });

  const dealer = await prisma.dealer.findUnique({
    where: { id: effectiveDealerId },
    select: { name: true },
  });

  const origin = request.headers.get("origin") || process.env.NEXTAUTH_URL || "https://www.ciafeed.com";
  const inviteUrl = `${origin}/team/accept?token=${token}`;
  await sendTeamInviteEmail(email, dealer?.name ?? "Your team", role, inviteUrl);

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerContext } from "@/lib/impersonation";
import { sendTeamInviteEmail } from "@/lib/email";

const VALID_ROLES = ["admin", "editor"];

export async function POST(request: NextRequest) {
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
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const role = typeof b.role === "string" ? b.role : "";
  const subAccountId = typeof b.subAccountId === "string" ? b.subAccountId : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }

  // Don't allow inviting yourself
  const dealer = await prisma.dealer.findUnique({
    where: { id: effectiveDealerId },
    select: { email: true, name: true },
  });
  if (!dealer) {
    return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
  }
  if (dealer.email.toLowerCase() === email) {
    return NextResponse.json({ error: "cannot_invite_self" }, { status: 400 });
  }

  // Check if already a team member
  const existing = await prisma.teamUser.findUnique({
    where: { dealerId_email: { dealerId: effectiveDealerId, email } },
  });
  if (existing) {
    return NextResponse.json({ error: "already_team_member" }, { status: 409 });
  }

  // Validate subAccountId if provided
  if (subAccountId) {
    const sub = await prisma.subAccount.findFirst({
      where: { id: subAccountId, dealerId: effectiveDealerId },
    });
    if (!sub) {
      return NextResponse.json({ error: "invalid_sub_account" }, { status: 400 });
    }
  }

  // Delete any existing pending invite for this email+dealer
  await prisma.teamInvite.deleteMany({
    where: { email, dealerId: effectiveDealerId },
  });

  // Create invite token
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

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

  // Send invite email
  const origin = request.headers.get("origin") || process.env.NEXTAUTH_URL || "https://www.ciafeed.com";
  const inviteUrl = `${origin}/team/accept?token=${token}`;
  await sendTeamInviteEmail(email, dealer.name, role, inviteUrl);

  return NextResponse.json({ success: true });
}

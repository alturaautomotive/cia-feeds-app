import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { teamAcceptBodySchema } from "@/lib/requestSchemas";
import { sendTeamPasswordSetEmail } from "@/lib/email";
import { hashPassword, validatePasswordStrength } from "@/lib/password";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";

  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  const invite = await prisma.teamInvite.findUnique({ where: { token } });

  if (!invite) {
    return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.json(
      { email: invite.email, role: invite.role, expired: true },
      { status: 200 }
    );
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: invite.dealerId },
    select: { name: true },
  });

  return NextResponse.json({
    email: invite.email,
    dealerName: dealer?.name ?? "Unknown",
    role: invite.role,
    expired: false,
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = teamAcceptBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { token, name, password } = parsed.data;

  const invite = await prisma.teamInvite.findUnique({ where: { token } });

  if (!invite) {
    return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  }

  if (invite.expiresAt < new Date()) {
    await prisma.teamInvite.delete({ where: { id: invite.id } });
    return NextResponse.json({ error: "token_expired" }, { status: 410 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: invite.dealerId },
    select: { name: true },
  });

  // HIBP breach check + length floor (SECURITY_AUDIT.md F-1.5).
  const strength = await validatePasswordStrength(password);
  if (!strength.ok) {
    return NextResponse.json(
      { error: "validation_error", issues: { password: [strength.reason] } },
      { status: 400 }
    );
  }

  const passwordHash = await hashPassword(password);

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.teamUser.findUnique({
        where: { dealerId_email: { dealerId: invite.dealerId, email: invite.email } },
      });

      if (existing && existing.passwordHash) {
        throw new Error("ALREADY_ACCEPTED");
      }

      if (existing) {
        // Re-accept path: existing row with null passwordHash
        await tx.teamUser.update({
          where: { id: existing.id },
          data: {
            name,
            passwordHash,
            subAccountId: invite.subAccountId,
            role: invite.role,
            acceptedAt: new Date(),
          },
        });
      } else {
        await tx.teamUser.create({
          data: {
            email: invite.email,
            dealerId: invite.dealerId,
            subAccountId: invite.subAccountId,
            role: invite.role,
            name,
            passwordHash,
            acceptedAt: new Date(),
          },
        });
      }

      await tx.teamInvite.delete({ where: { id: invite.id } });
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "ALREADY_ACCEPTED") {
      return NextResponse.json({ error: "already_accepted" }, { status: 409 });
    }
    throw err;
  }

  // Fire-and-forget email
  sendTeamPasswordSetEmail(invite.email, dealer?.name ?? "Your team").catch(() => {});

  // F-8.1: audit account-creation events for the parent dealer.
  await (await import("@/lib/adminAudit")).writeAuditLog({
    action: "team.invite.accepted",
    actorEmail: invite.email,
    actorRole: "teamuser",
    targetDealerId: invite.dealerId,
    metadata: { invitedRole: invite.role, subAccountId: invite.subAccountId ?? null },
  }).catch(() => {});

  return NextResponse.json({ success: true, email: invite.email });
}

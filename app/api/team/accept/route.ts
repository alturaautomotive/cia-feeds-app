import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const token = typeof b.token === "string" ? b.token.trim() : "";

  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  const invite = await prisma.teamInvite.findUnique({ where: { token } });

  if (!invite) {
    return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  }

  if (invite.expiresAt < new Date()) {
    await prisma.teamInvite.delete({ where: { id: invite.id } });
    return NextResponse.json({ error: "token_expired" }, { status: 410 });
  }

  // Check if already a team member (race condition guard)
  const existing = await prisma.teamUser.findUnique({
    where: { dealerId_email: { dealerId: invite.dealerId, email: invite.email } },
  });

  if (existing) {
    await prisma.teamInvite.delete({ where: { id: invite.id } });
    return NextResponse.json({ error: "already_accepted" }, { status: 409 });
  }

  // Create TeamUser and delete invite in a transaction
  const teamUser = await prisma.$transaction(async (tx) => {
    const tu = await tx.teamUser.create({
      data: {
        email: invite.email,
        dealerId: invite.dealerId,
        subAccountId: invite.subAccountId,
        role: invite.role,
        acceptedAt: new Date(),
      },
    });
    await tx.teamInvite.delete({ where: { id: invite.id } });
    return tu;
  });

  return NextResponse.json({
    success: true,
    dealerId: teamUser.dealerId,
    role: teamUser.role,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getEffectiveDealerContext } from "@/lib/impersonation";

export async function GET() {
  const { effectiveDealerId } = await getEffectiveDealerContext();
  if (!effectiveDealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [members, pendingInvites] = await Promise.all([
    prisma.teamUser.findMany({
      where: { dealerId: effectiveDealerId },
      orderBy: { invitedAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        subAccountId: true,
        invitedAt: true,
        acceptedAt: true,
        passwordHash: true,
        subAccount: { select: { name: true } },
      },
    }),
    prisma.teamInvite.findMany({
      where: { dealerId: effectiveDealerId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        role: true,
        subAccountId: true,
        createdAt: true,
        expiresAt: true,
      },
    }),
  ]);

  // Map members to avoid leaking passwordHash
  const mappedMembers = members.map((m) => ({
    id: m.id,
    email: m.email,
    name: m.name,
    role: m.role,
    subAccountId: m.subAccountId,
    invitedAt: m.invitedAt,
    acceptedAt: m.acceptedAt,
    subAccount: m.subAccount,
    passwordSet: m.passwordHash !== null,
  }));

  return NextResponse.json({ members: mappedMembers, pendingInvites });
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Editors cannot delete team members
  if (session.user.teamUser?.role === "editor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { effectiveDealerId } = await getEffectiveDealerContext();
  if (!effectiveDealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get("id");
  const inviteId = searchParams.get("inviteId");

  if (memberId) {
    const member = await prisma.teamUser.findFirst({
      where: { id: memberId, dealerId: effectiveDealerId },
    });
    if (!member) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await prisma.teamUser.delete({ where: { id: memberId } });
    return NextResponse.json({ success: true });
  }

  if (inviteId) {
    const invite = await prisma.teamInvite.findFirst({
      where: { id: inviteId, dealerId: effectiveDealerId },
    });
    if (!invite) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await prisma.teamInvite.delete({ where: { id: inviteId } });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "missing_id" }, { status: 400 });
}

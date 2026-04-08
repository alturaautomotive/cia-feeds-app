import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signImpersonationToken, IMPERSONATION_COOKIE } from "@/lib/impersonation";
import { cookies } from "next/headers";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "").toLowerCase();

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { dealerId } = (await request.json()) as { dealerId?: string };
  if (!dealerId) {
    return NextResponse.json({ error: "dealerId is required" }, { status: 400 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { id: true },
  });
  if (!dealer) {
    return NextResponse.json({ error: "dealer not found" }, { status: 404 });
  }

  const token = await signImpersonationToken(dealerId);

  return NextResponse.json({ token });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATION_COOKIE);

  return NextResponse.json({ ok: true });
}

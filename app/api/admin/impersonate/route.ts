import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/auth";
import { signImpersonationToken, IMPERSONATION_COOKIE } from "@/lib/impersonation";
import { writeAuditLog } from "@/lib/adminAudit";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const auth = await adminGuard("manage_delivery");
  if (!auth.ok) return auth.response!;

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

  await writeAuditLog({
    action: "admin.impersonate.start",
    actorEmail: auth.email,
    actorRole: auth.role,
    targetDealerId: dealerId,
    metadata: { source: "admin_panel" },
  });

  return NextResponse.json({ token });
}

export async function DELETE() {
  const auth = await adminGuard("manage_delivery");
  if (!auth.ok) return auth.response!;

  await writeAuditLog({
    action: "admin.impersonate.stop",
    actorEmail: auth.email,
    actorRole: auth.role,
  });

  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATION_COOKIE);

  return NextResponse.json({ ok: true });
}

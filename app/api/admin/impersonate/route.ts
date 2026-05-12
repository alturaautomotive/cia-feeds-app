import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/auth";
import { signImpersonationToken, IMPERSONATION_COOKIE } from "@/lib/impersonation";
import { writeAuditLog } from "@/lib/adminAudit";
import { cookies } from "next/headers";

/**
 * Start an impersonation session.
 *
 * Security (SECURITY_AUDIT.md F-1.4): this endpoint now SETS the
 * IMPERSONATION_COOKIE directly on its same-origin POST response. The old
 * design returned a token and required the client to GET /activate?token=,
 * which was vulnerable to CSRF \u2014 an attacker could craft a link with their
 * chosen token and trick an admin into clicking it. By setting the cookie
 * here we eliminate the GET path entirely (kept only as a redirect to /dashboard
 * for backwards compatibility).
 *
 * POST is inherently CSRF-resistant: browsers will not auto-send credentials
 * to a cross-origin POST with a JSON content-type. The dashboard frontend
 * makes this call via same-origin fetch.
 */
export async function POST(request: Request) {
  const auth = await adminGuard("manage_delivery");
  if (!auth.ok) return auth.response!;

  const { dealerId } = (await request.json()) as { dealerId?: string };
  if (!dealerId) {
    return NextResponse.json({ error: "dealerId is required" }, { status: 400 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId, active: true },
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

  // Set the cookie inline so the client never holds the raw token.
  const response = NextResponse.json({ ok: true });
  response.cookies.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 3600,
    path: "/",
  });
  return response;
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

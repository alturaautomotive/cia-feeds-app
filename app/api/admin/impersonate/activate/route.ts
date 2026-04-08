import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  verifyImpersonationToken,
  IMPERSONATION_COOKIE,
} from "@/lib/impersonation";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "").toLowerCase();

/**
 * GET /api/admin/impersonate/activate?token=<jwt>
 *
 * Verifies the impersonation token, sets the cookie, and redirects to /dashboard.
 * Cookie mutation must happen in a Route Handler, not a Server Component.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (
    !session?.user?.email ||
    session.user.email.toLowerCase() !== ADMIN_EMAIL
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const dealerId = await verifyImpersonationToken(token);
  if (!dealerId) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  response.cookies.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 3600,
    path: "/",
  });
  return response;
}

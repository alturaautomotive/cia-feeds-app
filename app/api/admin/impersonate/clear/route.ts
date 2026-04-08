import { NextRequest, NextResponse } from "next/server";
import { IMPERSONATION_COOKIE } from "@/lib/impersonation";

/**
 * GET /api/admin/impersonate/clear
 *
 * Clears the impersonation cookie and redirects to /dashboard.
 * Used when a non-admin has a stale cookie or when the token is invalid/expired.
 */
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  response.cookies.delete(IMPERSONATION_COOKIE);
  return response;
}

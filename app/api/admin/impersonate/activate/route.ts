import { NextRequest, NextResponse } from "next/server";

/**
 * Legacy /activate endpoint.
 *
 * Previously a GET with ?token= that set the IMPERSONATION_COOKIE \u2014 vulnerable
 * to CSRF (SECURITY_AUDIT.md F-1.4). The token-issuance endpoint
 * (POST /api/admin/impersonate) now sets the cookie inline, so this route
 * is no longer needed. It remains as a redirect-to-/dashboard for any
 * bookmarked admin links from the previous UX.
 */
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/dashboard", request.url));
}

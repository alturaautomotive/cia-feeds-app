import { NextRequest, NextResponse } from "next/server";

/**
 * Receives CSP violation reports while CSP is in Report-Only mode
 * (SECURITY_AUDIT.md F-5.1 follow-up).
 *
 * Browsers POST a JSON payload here whenever a directive in
 * Content-Security-Policy-Report-Only would have blocked something. We log
 * the report to stdout (Vercel collects it) so we can see what real user
 * traffic would break if we switched to enforcing mode.
 *
 * After ~1 week of clean reports we can:
 *   1. Flip `Content-Security-Policy-Report-Only` \u2192 `Content-Security-Policy`
 *      in next.config.ts
 *   2. Optionally remove this endpoint
 */
export const dynamic = "force-dynamic";

interface CspReportPayload {
  "csp-report"?: {
    "document-uri"?: string;
    referrer?: string;
    "blocked-uri"?: string;
    "violated-directive"?: string;
    "effective-directive"?: string;
    "original-policy"?: string;
    disposition?: string;
    "status-code"?: number;
    "script-sample"?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CspReportPayload;
    const report = body["csp-report"];
    if (report) {
      console.warn({
        event: "csp_violation",
        directive: report["effective-directive"] ?? report["violated-directive"],
        blockedUri: report["blocked-uri"],
        documentUri: report["document-uri"],
        sample: report["script-sample"]?.slice(0, 200),
      });
    }
  } catch {
    // Swallow \u2014 invalid reports should never break the page they were sent from.
  }
  // Browsers ignore the response body; 204 is conventional.
  return new NextResponse(null, { status: 204 });
}

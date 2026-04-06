import { NextResponse } from "next/server";

// Auth is handled server-side by getServerSession in layout/page components.
// Do NOT use next-auth/middleware's withAuth here — it is incompatible with
// the Next.js 16 proxy runtime and silently fails JWT verification, causing
// redirect loops.
export function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/subscribe"],
};

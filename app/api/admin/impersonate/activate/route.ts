import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/auth";
import {
  verifyImpersonationToken,
  IMPERSONATION_COOKIE,
} from "@/lib/impersonation";

export async function GET(request: NextRequest) {
  const auth = await adminGuard("manage_delivery");
  if (!auth.ok) {
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

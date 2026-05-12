import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, validatePasswordStrength, MIN_PASSWORD_LENGTH } from "@/lib/password";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { token, newPassword } = body as Record<string, unknown>;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `newPassword must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  try {
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken || resetToken.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "invalid_or_expired_token" },
        { status: 400 }
      );
    }

    // HIBP breach check + length floor (SECURITY_AUDIT.md F-1.5).
    const strength = await validatePasswordStrength(newPassword);
    if (!strength.ok) {
      return NextResponse.json({ error: strength.reason }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.dealer.update({
      where: { email: resetToken.email },
      data: { passwordHash },
    });

    await prisma.passwordResetToken.delete({ where: { token } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[reset-password] internal error:", err);
    return NextResponse.json({ error: "reset_failed" }, { status: 500 });
  }
}

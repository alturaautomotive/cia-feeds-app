import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { email } = body as Record<string, unknown>;

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  try {
    const dealer = await prisma.dealer.findUnique({ where: { email } });

    if (dealer) {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.passwordResetToken.create({
        data: { email, token, expiresAt },
      });

      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
      const resetUrl = `${appUrl}/reset-password?token=${token}`;

      sendPasswordResetEmail(email, resetUrl).catch((err) =>
        console.error("[forgot-password] email failed:", err)
      );
    }
  } catch (err) {
    console.error("[forgot-password] internal error:", err);
  }

  return NextResponse.json({ success: true });
}

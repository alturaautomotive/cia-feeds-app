import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import { durableRateLimit } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const rl = await durableRateLimit(`forgot:${ip}`, 3, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }

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

      await prisma.passwordResetToken.deleteMany({
        where: { email, expiresAt: { lt: new Date() } },
      });

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

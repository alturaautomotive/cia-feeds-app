import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import { criticalDurableRateLimit } from "@/lib/rateLimit";
import { forgotPasswordBodySchema } from "@/lib/requestSchemas";

export async function POST(request: NextRequest) {
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const rl = await criticalDurableRateLimit(`forgot:${ip}`, 3, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = forgotPasswordBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { email } = parsed.data;

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

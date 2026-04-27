import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateUniqueSlug } from "@/lib/slug";
import { sendWelcomeEmail, sendAdminNewSignupEmail } from "@/lib/email";
import { durableRateLimit } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const rl = await durableRateLimit(`signup:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { name, email, password, vertical } = body as Record<string, unknown>;

  if (
    !name ||
    typeof name !== "string" ||
    !email ||
    typeof email !== "string" ||
    !password ||
    typeof password !== "string"
  ) {
    return NextResponse.json(
      { error: "name, email, and password are required" },
      { status: 400 }
    );
  }

  const VALID_VERTICALS = ["automotive", "services", "ecommerce", "realestate"];
  if (vertical != null && (typeof vertical !== "string" || !VALID_VERTICALS.includes(vertical))) {
    return NextResponse.json({ error: "invalid_vertical" }, { status: 400 });
  }
  const dealerVertical = (typeof vertical === "string" ? vertical : "automotive") as "automotive" | "services" | "ecommerce" | "realestate";

  const trimmedName = name.trim();
  if (!trimmedName) {
    return NextResponse.json(
      { error: "name must not be blank" },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.dealer.findUnique({
      where: { email },
    });

    if (existing) {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const slug = await generateUniqueSlug(trimmedName, prisma);

    const dealer = await prisma.dealer.create({
      data: {
        name: trimmedName,
        email,
        passwordHash,
        slug,
        vertical: dealerVertical,
        active: true,
      },
    });

    // Create the first SubAccount for the new dealer
    const subAccount = await prisma.subAccount.create({
      data: {
        dealerId: dealer.id,
        vertical: dealerVertical,
        name: `${trimmedName} (${dealerVertical})`,
      },
    });

    // Set the default sub-account
    await prisma.dealer.update({
      where: { id: dealer.id },
      data: { defaultSubAccountId: subAccount.id },
    });

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
    const feedUrl = `${baseUrl}/feeds/${slug}.csv`;

    Promise.all([
      sendWelcomeEmail(dealer.name, dealer.email),
      sendAdminNewSignupEmail(dealer.name, dealer.email),
    ]).catch((err) => console.error("[signup] email notification failed:", err));

    return NextResponse.json(
      {
        id: dealer.id,
        name: dealer.name,
        slug: dealer.slug,
        feedUrl,
        defaultSubAccountId: subAccount.id,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[signup] Error creating dealer:", err);
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json(
      { error: "signup_failed", detail: message },
      { status: 500 }
    );
  }
}

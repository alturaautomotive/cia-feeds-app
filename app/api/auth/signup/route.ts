import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateUniqueSlug } from "@/lib/slug";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { name, email, password } = body as Record<string, unknown>;

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
        active: true,
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL ?? new URL(request.url).origin;
    const feedUrl = `${baseUrl}/feeds/${slug}.csv`;

    return NextResponse.json(
      {
        id: dealer.id,
        name: dealer.name,
        slug: dealer.slug,
        feedUrl,
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

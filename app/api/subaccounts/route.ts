import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerContext } from "@/lib/impersonation";
import { Vertical } from "@prisma/client";

const VALID_VERTICALS = ["automotive", "services", "ecommerce", "realestate"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { effectiveDealerId } = await getEffectiveDealerContext();
  if (!effectiveDealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const subAccounts = await prisma.subAccount.findMany({
    where: { dealerId: effectiveDealerId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ subAccounts });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { effectiveDealerId } = await getEffectiveDealerContext();
  if (!effectiveDealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { name, vertical } = body as Record<string, unknown>;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (!vertical || typeof vertical !== "string" || !VALID_VERTICALS.includes(vertical)) {
    return NextResponse.json({ error: "invalid_vertical" }, { status: 400 });
  }

  try {
    const subAccount = await prisma.subAccount.create({
      data: {
        dealerId: effectiveDealerId,
        name: name.trim(),
        vertical: vertical as Vertical,
        createdAt: new Date(),
      },
    });

    return NextResponse.json({ subAccount }, { status: 201 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to create sub-account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

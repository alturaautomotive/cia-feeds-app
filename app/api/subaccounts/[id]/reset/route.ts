import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerContext } from "@/lib/impersonation";

const VALID_VERTICALS = ["automotive", "services", "ecommerce", "realestate"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { effectiveDealerId } = await getEffectiveDealerContext();
  if (!effectiveDealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: subAccountId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { vertical } = body as Record<string, unknown>;
  if (!vertical || typeof vertical !== "string" || !VALID_VERTICALS.includes(vertical)) {
    return NextResponse.json({ error: "invalid_vertical" }, { status: 400 });
  }

  // Verify ownership
  const subAccount = await prisma.subAccount.findUnique({
    where: { id: subAccountId },
  });
  if (!subAccount || subAccount.dealerId !== effectiveDealerId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Transaction: delete scoped data then update vertical
  await prisma.$transaction([
    prisma.crawlSnapshot.deleteMany({ where: { subAccountId } }),
    prisma.crawlJob.deleteMany({ where: { subAccountId } }),
    prisma.listing.deleteMany({ where: { subAccountId } }),
    prisma.vehicle.deleteMany({ where: { subAccountId } }),
    prisma.subAccount.update({
      where: { id: subAccountId },
      data: { vertical: vertical as "automotive" | "services" | "ecommerce" | "realestate" },
    }),
  ]);

  return NextResponse.json({ success: true });
}

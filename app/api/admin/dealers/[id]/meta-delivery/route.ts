import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { API_SUPPORTED_VERTICALS } from "@/lib/metaDelivery";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "").toLowerCase();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { metaDeliveryMethod } = body as Record<string, unknown>;

  if (typeof metaDeliveryMethod !== "string" || (metaDeliveryMethod !== "csv" && metaDeliveryMethod !== "api")) {
    return NextResponse.json({ error: "invalid_metaDeliveryMethod", allowed: ["csv", "api"] }, { status: 400 });
  }

  const dealer = await prisma.dealer.findUnique({ where: { id }, select: { id: true, vertical: true } });
  if (!dealer) {
    return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
  }

  if (metaDeliveryMethod === "api" && !API_SUPPORTED_VERTICALS.has(dealer.vertical)) {
    return NextResponse.json(
      { error: "api_delivery_unsupported_vertical", vertical: dealer.vertical, allowed: Array.from(API_SUPPORTED_VERTICALS) },
      { status: 400 }
    );
  }

  const updated = await prisma.dealer.update({
    where: { id },
    data: { metaDeliveryMethod },
    select: { id: true, metaDeliveryMethod: true },
  });

  return NextResponse.json({ ok: true, dealer: updated });
}

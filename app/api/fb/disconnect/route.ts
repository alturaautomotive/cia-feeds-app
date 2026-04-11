import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";

/**
 * POST /api/fb/disconnect — Clears the stored Facebook Page id for the dealer.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await prisma.dealer.update({
    where: { id: dealerId },
    // fbPageId is added by the schema migration phase — cast so this compiles
    // before that migration lands.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { fbPageId: null } as unknown as any,
  });

  return NextResponse.json({ ok: true });
}

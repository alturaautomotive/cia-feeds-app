import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isSubscribed = await checkSubscription(session.user.id);
  if (!isSubscribed) {
    return NextResponse.json({ error: "subscription_required" }, { status: 403 });
  }

  const { id } = await params;

  const listing = await prisma.listing.findFirst({
    where: { id, dealerId: session.user.id },
  });

  if (!listing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.listing.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";

const VALID_VERTICALS = ["automotive", "services", "ecommerce", "realestate"];

const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  slug: true,
  profileImageUrl: true,
  vertical: true,
} as const;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: session.user.id },
    select: SAFE_SELECT,
  });

  if (!dealer) {
    return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
  }

  return NextResponse.json({ dealer });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isSubscribed = await checkSubscription(session.user.id);
  if (!isSubscribed) {
    return NextResponse.json({ error: "subscription_required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  // Handle profile image removal
  if ("profileImageUrl" in b && b.profileImageUrl === null) {
    await prisma.dealer.update({
      where: { id: session.user.id },
      data: { profileImageUrl: null },
    });
  }

  // Handle vertical switch
  if ("vertical" in b) {
    if (typeof b.vertical !== "string" || !VALID_VERTICALS.includes(b.vertical)) {
      return NextResponse.json({ error: "invalid_vertical" }, { status: 400 });
    }

    const newVertical = b.vertical;

    const dealer = await prisma.dealer.findUnique({
      where: { id: session.user.id },
      select: { vertical: true },
    });

    if (!dealer) {
      return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
    }

    const oldVertical = dealer.vertical;

    if (oldVertical !== newVertical) {
      const now = new Date();

      let updatedDealer;

      await prisma.$transaction(async (tx) => {
        // Archive current inventory for the old vertical
        if (oldVertical === "automotive") {
          await tx.vehicle.updateMany({
            where: { dealerId: session.user!.id!, archivedAt: null },
            data: { archivedAt: now },
          });
        } else {
          await tx.listing.updateMany({
            where: {
              dealerId: session.user!.id!,
              vertical: oldVertical,
              archivedAt: null,
            },
            data: { archivedAt: now },
          });
        }

        // Restore any previously archived inventory for the new vertical
        if (newVertical === "automotive") {
          await tx.vehicle.updateMany({
            where: { dealerId: session.user!.id!, archivedAt: { not: null } },
            data: { archivedAt: null },
          });
        } else {
          await tx.listing.updateMany({
            where: {
              dealerId: session.user!.id!,
              vertical: newVertical,
              archivedAt: { not: null },
            },
            data: { archivedAt: null },
          });
        }

        // Update dealer vertical
        updatedDealer = await tx.dealer.update({
          where: { id: session.user!.id! },
          data: { vertical: newVertical },
          select: { id: true, name: true, email: true, slug: true, profileImageUrl: true, vertical: true },
        });
      });

      return NextResponse.json({ ok: true, dealer: updatedDealer });
    }
  }

  const currentDealer = await prisma.dealer.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, slug: true, profileImageUrl: true, vertical: true },
  });
  return NextResponse.json({ ok: true, dealer: currentDealer });
}

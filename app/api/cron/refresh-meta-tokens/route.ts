import { NextResponse } from "next/server";
import { encrypt } from "@/lib/crypto";
import { decryptToken, refreshToken } from "@/lib/meta";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (process.env.VERCEL_CRON !== "1") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const threshold = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const expiringDealers = await prisma.dealer.findMany({
    where: {
      metaDeliveryMethod: "api",
      metaAccessToken: { not: null },
      metaTokenExpiresAt: { lt: threshold },
    },
    select: {
      id: true,
      metaAccessToken: true,
      metaTokenExpiresAt: true,
    },
  });

  let refreshed = 0;
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const dealer of expiringDealers) {
    if (!dealer.metaAccessToken) {
      console.warn(`Skipping ${dealer.id}: metaAccessToken is null`);
      skipped.push(dealer.id);
      continue;
    }
    if (!dealer.metaTokenExpiresAt) {
      console.warn(`Skipping ${dealer.id}: metaTokenExpiresAt is null`);
      skipped.push(dealer.id);
      continue;
    }
    try {
      const { token: newToken, expiresAt } = await refreshToken(
        decryptToken(dealer.metaAccessToken)
      );
      await prisma.dealer.update({
        where: { id: dealer.id },
        data: {
          metaAccessToken: encrypt(newToken),
          metaTokenExpiresAt: expiresAt,
        },
      });
      console.log(`Refreshed ${dealer.id}`);
      refreshed++;
    } catch (e) {
      console.error(`Failed ${dealer.id}:`, e);
      errors.push(dealer.id);
    }
  }

  return NextResponse.json({ refreshed, skipped: skipped.length, failed: errors.length });
}

import { NextRequest, NextResponse } from "next/server";
import { encrypt } from "@/lib/crypto";
import { decryptToken, refreshToken } from "@/lib/meta";
import { prisma } from "@/lib/prisma";
import { sendMetaTokenInvalidEmail } from "@/lib/email";

/**
 * Weekly Meta token refresh cron.
 *
 * On failure we mark the dealer's token as invalid (metaTokenInvalidAt),
 * downgrade them to CSV delivery, and notify them by email so they can
 * reconnect (SECURITY_AUDIT.md F-2.7). Without this email, dealers
 * silently lose API delivery for weeks until they happen to log in.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const threshold = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const expiringDealers = await prisma.dealer.findMany({
    where: {
      metaDeliveryMethod: "api",
      metaAccessToken: { not: null },
      metaTokenExpiresAt: { lt: threshold },
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      metaAccessToken: true,
      metaTokenExpiresAt: true,
      metaTokenInvalidAt: true,
    },
  });

  let refreshed = 0;
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const dealer of expiringDealers) {
    if (!dealer.metaAccessToken || !dealer.metaTokenExpiresAt) {
      console.warn({ event: "meta_refresh_skip", dealerId: dealer.id });
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
          // Clear invalid marker on successful refresh.
          metaTokenInvalidAt: null,
        },
      });
      refreshed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error({ event: "meta_refresh_failed", dealerId: dealer.id, message });
      errors.push(dealer.id);

      // Mark dealer's connection invalid + downgrade to CSV delivery.
      // Only notify by email if we haven't already (dedupe via
      // metaTokenInvalidAt being null => fresh failure).
      const wasFirstFailure = !dealer.metaTokenInvalidAt;
      try {
        await prisma.dealer.update({
          where: { id: dealer.id },
          data: {
            metaTokenInvalidAt: dealer.metaTokenInvalidAt ?? new Date(),
            metaDeliveryMethod: "csv",
          },
        });
        if (wasFirstFailure) {
          await sendMetaTokenInvalidEmail(dealer.email, dealer.name);
        }
      } catch (notifyErr) {
        console.error({
          event: "meta_refresh_notify_failed",
          dealerId: dealer.id,
          message: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        });
      }
    }
  }

  return NextResponse.json({
    refreshed,
    skipped: skipped.length,
    failed: errors.length,
    failedIds: errors,
  });
}

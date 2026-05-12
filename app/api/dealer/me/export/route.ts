import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { criticalDurableRateLimit } from "@/lib/rateLimit";
import { writeAuditLog } from "@/lib/adminAudit";

/**
 * GET /api/dealer/me/export
 *
 * GDPR Article 20 portability + CCPA right-to-know (SECURITY_AUDIT.md F-8.3).
 * Returns the dealer's complete data as a downloadable JSON file. Excludes
 * sensitive credentials (passwordHash, metaAccessToken, trackingSecret \u2014
 * those are server-only) but includes every business record.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Heavy operation \u2014 fail closed at 3 exports per hour per dealer.
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const rl = await criticalDurableRateLimit(`export:${dealerId}:${ip}`, 3, 60 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429 }
    );
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      id: true,
      name: true,
      email: true,
      slug: true,
      vertical: true,
      websiteUrl: true,
      address: true,
      phone: true,
      latitude: true,
      longitude: true,
      profileImageUrl: true,
      createdAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      fbPageId: true,
      metaBusinessId: true,
      metaCatalogId: true,
      metaPixelId: true,
      metaConnectedAt: true,
      metaDeliveryMethod: true,
      vehicles: true,
      listings: true,
      crawlJobs: { select: { id: true, status: true, startedAt: true, completedAt: true } },
      leads: true,
      subAccounts: true,
      teamUsers: {
        select: { id: true, email: true, name: true, role: true, acceptedAt: true, invitedAt: true },
      },
      // NOTE: passwordHash, metaAccessToken, trackingSecret intentionally NOT exported.
    },
  });

  if (!dealer) {
    return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
  }

  await writeAuditLog({
    action: "dealer.data.export",
    actorEmail: session.user.email ?? "unknown",
    actorRole: "dealer",
    actorDealerId: dealerId,
    targetDealerId: dealerId,
  }).catch(() => {});

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    apiVersion: 1,
    note:
      "This export contains all personal and business data CIA Feeds holds about your account. " +
      "Credentials (password hash, encrypted Meta token, tracking signing secret) are intentionally excluded " +
      "as they are non-portable security artifacts.",
    dealer,
  };

  const body = JSON.stringify(exportPayload, null, 2);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="ciafeeds-export-${dealer.slug}-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}

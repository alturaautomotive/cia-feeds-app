/**
 * Dealer-facing Retargeting page.
 *
 * Shows the dealer their auto-managed Meta Custom Audiences:
 *   - viewed_any_30d        (Website CA - all storefront visitors)
 *   - viewed_listing_30d    (Website CA - one per active item)
 *   - lead_no_followup_30d  (Customer File CA - hashed lead PII)
 *   - lookalike_of_*        (Lookalike CAs, when generated)
 *
 * Each row links out to the dealer's own Meta Ads Manager so they can
 * actually run ads against the audience. A "Create Lookalike" button
 * fires a server action that calls Meta's Marketing API.
 *
 * If Meta isn't connected yet, we render a clear empty state pointing
 * the dealer at the profile page where they finish OAuth + pick a pixel.
 */
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerContext } from "@/lib/impersonation";
import { RetargetingClient } from "./RetargetingClient";

export const dynamic = "force-dynamic";

export default async function RetargetingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const ctx = await getEffectiveDealerContext();
  if (!ctx.effectiveDealerId) redirect("/login");
  const dealerId = ctx.effectiveDealerId;

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      id: true,
      slug: true,
      vertical: true,
      metaPixelId: true,
      metaAdAccountId: true,
      metaBusinessId: true,
      metaAccessToken: true,
    },
  });

  if (!dealer) redirect("/login");

  const metaConnected = !!(
    dealer.metaPixelId &&
    dealer.metaAdAccountId &&
    dealer.metaAccessToken
  );

  const audiences = metaConnected
    ? await prisma.metaCustomAudience.findMany({
        where: { dealerId },
        orderBy: [{ audienceKind: "asc" }, { createdAt: "asc" }],
      })
    : [];

  return (
    <RetargetingClient
      dealerSlug={dealer.slug}
      metaConnected={metaConnected}
      adAccountId={dealer.metaAdAccountId}
      pixelId={dealer.metaPixelId}
      audiences={audiences.map((a) => ({
        id: a.id,
        kind: a.audienceKind,
        metaAudienceId: a.metaAudienceId,
        metaAdAccountId: a.metaAdAccountId,
        name: a.name,
        description: a.description,
        estimatedSize: a.estimatedSize,
        lastRefreshedAt: a.lastRefreshedAt?.toISOString() ?? null,
        sourceListingId: a.sourceListingId,
        sourceVehicleId: a.sourceVehicleId,
      }))}
    />
  );
}

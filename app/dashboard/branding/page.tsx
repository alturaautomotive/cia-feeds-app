import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { getEffectiveDealerContext } from "@/lib/impersonation";
import { BRAND_PRESETS } from "@/lib/brandPresets";
import BrandingClient from "./BrandingClient";

/**
 * Storefront branding settings.
 *
 * Lets the dealer:
 *   - Pick a brand preset (Toyota, Mazda, etc.) or "Custom"
 *   - Override individual colors for the "Custom" preset
 *   - Set a storefront logo (separate from the dashboard profile image)
 *
 * Changes are persisted via PUT /api/dealer/branding and immediately
 * preview-rendered without leaving the page.
 */
export default async function BrandingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { effectiveDealerId } = await getEffectiveDealerContext();
  if (!effectiveDealerId) redirect("/login");

  const isSubscribed = await checkSubscription(effectiveDealerId);
  if (!isSubscribed) redirect("/subscribe");

  const dealer = await prisma.dealer.findUnique({
    where: { id: effectiveDealerId },
    select: {
      slug: true,
      name: true,
      themePreset: true,
      themeOverrides: true,
      logoUrl: true,
      profileImageUrl: true,
    },
  });
  if (!dealer) redirect("/login");

  const presetList = Object.entries(BRAND_PRESETS).map(([key, p]) => ({
    key,
    label: p.label,
    primary: p.primary,
  }));

  return (
    <BrandingClient
      slug={dealer.slug}
      name={dealer.name}
      initial={{
        themePreset: dealer.themePreset ?? "neutral",
        themeOverrides:
          (dealer.themeOverrides as Record<string, string> | null) ?? {},
        logoUrl: dealer.logoUrl,
        profileImageUrl: dealer.profileImageUrl,
      }}
      presets={presetList}
    />
  );
}

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { getEffectiveDealerContext } from "@/lib/impersonation";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { effectiveDealerId } =
    await getEffectiveDealerContext();

  if (!effectiveDealerId) {
    redirect("/login");
  }

  const isSubscribed = await checkSubscription(effectiveDealerId);
  if (!isSubscribed) {
    redirect("/subscribe");
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: effectiveDealerId },
    select: {
      profileImageUrl: true,
      vertical: true,
      websiteUrl: true,
      address: true,
      phone: true,
      ctaPreference: true,
      latitude: true,
      longitude: true,
      fbPageId: true,
      metaAccessToken: true,
      metaCatalogId: true,
      metaFeedId: true,
    },
  });

  return (
    <ProfileClient
      profileImageUrl={dealer?.profileImageUrl ?? null}
      currentVertical={dealer?.vertical ?? "automotive"}
      websiteUrl={dealer?.websiteUrl ?? null}
      address={dealer?.address ?? null}
      phone={dealer?.phone ?? null}
      ctaPreference={dealer?.ctaPreference ?? null}
      fbPageId={dealer?.fbPageId ?? null}
      isMetaConnected={!!dealer?.metaAccessToken}
      metaCatalogId={dealer?.metaCatalogId ?? null}
      metaFeedId={dealer?.metaFeedId ?? null}
    />
  );
}

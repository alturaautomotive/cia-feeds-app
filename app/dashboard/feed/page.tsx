import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { getEffectiveDealerContext } from "@/lib/impersonation";
import FeedUrlCard from "./FeedUrlCard";
import EmbedWidgetCard from "./EmbedWidgetCard";

export default async function FeedPage() {
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
    select: { slug: true, vertical: true, phone: true, fbPageId: true },
  });

  const slug = dealer?.slug ?? (session.user.slug as string | undefined) ?? "";
  const dealerVertical = dealer?.vertical ?? "automotive";

  if (!slug) {
    redirect("/login");
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const feedUrl = `${appUrl}/feeds/${slug}.csv`;
  const catalogApiUrl = `${appUrl}/api/catalog/${slug}`;
  const dealerPhone = dealer?.phone ?? null;
  const dealerFbPageId = dealer?.fbPageId ?? null;

  return (
    <FeedUrlCard
      feedUrl={feedUrl}
      userName={session.user.name ?? ""}
      vertical={dealerVertical}
    >
      <EmbedWidgetCard
        slug={slug}
        phone={dealerPhone}
        fbPageId={dealerFbPageId}
        vertical={dealerVertical}
        catalogApiUrl={catalogApiUrl}
      />
    </FeedUrlCard>
  );
}

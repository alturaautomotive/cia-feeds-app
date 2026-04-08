import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { getEffectiveDealerContext } from "@/lib/impersonation";
import { CrawlClient } from "./CrawlClient";

export default async function CrawlPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { effectiveDealerId, isImpersonating } = await getEffectiveDealerContext();
  if (!effectiveDealerId) {
    redirect("/login");
  }

  const isSubscribed = await checkSubscription(effectiveDealerId);
  if (!isSubscribed) {
    redirect("/subscribe");
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: effectiveDealerId },
    select: { name: true, vertical: true, websiteUrl: true },
  });

  if (!dealer || (dealer.vertical !== "automotive" && dealer.vertical !== "ecommerce")) {
    redirect("/dashboard");
  }

  const lastCrawlJob = await prisma.crawlJob.findFirst({
    where: { dealerId: effectiveDealerId, status: "complete" },
    orderBy: { startedAt: "desc" },
    select: { completedAt: true, urlsFound: true },
  });

  const snapshots = await prisma.crawlSnapshot.findMany({
    where: { dealerId: effectiveDealerId },
    orderBy: { firstSeenAt: "desc" },
    select: {
      id: true,
      url: true,
      firstSeenAt: true,
      lastSeenAt: true,
      weeksActive: true,
      addedToFeed: true,
      make: true,
      model: true,
      year: true,
      price: true,
    },
  });

  return (
    <CrawlClient
      dealerName={dealer.name}
      websiteUrl={dealer.websiteUrl ?? ""}
      vertical={dealer.vertical}
      lastCrawl={
        lastCrawlJob?.completedAt
          ? {
              completedAt: lastCrawlJob.completedAt.toISOString(),
              urlsFound: lastCrawlJob.urlsFound ?? 0,
            }
          : null
      }
      initialSnapshots={snapshots.map((s) => ({
        ...s,
        firstSeenAt: s.firstSeenAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
      }))}
      isImpersonating={isImpersonating}
    />
  );
}

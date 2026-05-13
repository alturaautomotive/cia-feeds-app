import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { getEffectiveDealerContext } from "@/lib/impersonation";
import DomainClient from "./DomainClient";

export default async function DomainPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const { effectiveDealerId } = await getEffectiveDealerContext();
  if (!effectiveDealerId) redirect("/login");

  const isSubscribed = await checkSubscription(effectiveDealerId);
  if (!isSubscribed) redirect("/subscribe");

  const dealer = await prisma.dealer.findUnique({
    where: { id: effectiveDealerId },
    select: { slug: true, customDomain: true },
  });
  if (!dealer) redirect("/login");

  return (
    <DomainClient
      slug={dealer.slug}
      initialDomain={dealer.customDomain}
      subdomainUrl={`https://${dealer.slug}.ciafeed.com`}
    />
  );
}

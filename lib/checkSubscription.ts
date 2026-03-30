import { prisma } from "@/lib/prisma";

export async function checkSubscription(dealerId: string): Promise<boolean> {
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { subscriptionStatus: true },
  });
  return dealer?.subscriptionStatus === "active";
}

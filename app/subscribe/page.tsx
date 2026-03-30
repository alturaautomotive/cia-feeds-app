import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SubscribeClient } from "./SubscribeClient";

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: session.user.id },
    select: { subscriptionStatus: true },
  });

  if (dealer?.subscriptionStatus === "active") {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const canceled = params.canceled === "true";

  return <SubscribeClient canceled={canceled} />;
}

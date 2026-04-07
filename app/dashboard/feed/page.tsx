import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import FeedUrlCard from "./FeedUrlCard";

export default async function FeedPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const isSubscribed = await checkSubscription(session.user.id);
  if (!isSubscribed) {
    redirect("/subscribe");
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: session.user.id },
    select: { slug: true, vertical: true },
  });

  const slug = dealer?.slug ?? (session.user.slug as string | undefined) ?? "";
  const dealerVertical = dealer?.vertical ?? "automotive";

  if (!slug) {
    redirect("/login");
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const feedUrl = `${appUrl}/feeds/${slug}.csv`;

  return (
    <FeedUrlCard
      feedUrl={feedUrl}
      userName={session.user.name ?? ""}
      vertical={dealerVertical}
    />
  );
}

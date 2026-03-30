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

  let slug = session.user.slug as string | undefined;

  if (!slug) {
    const dealer = await prisma.dealer.findUnique({
      where: { id: session.user.id },
      select: { slug: true },
    });
    slug = dealer?.slug ?? "";
  }

  if (!slug) {
    redirect("/login");
  }

  const feedUrl = `https://app.ciafeeds.com/feeds/${slug}.csv`;

  return (
    <FeedUrlCard
      feedUrl={feedUrl}
      userName={session.user.name ?? ""}
    />
  );
}

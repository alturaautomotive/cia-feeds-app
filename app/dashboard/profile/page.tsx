import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
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
    select: { profileImageUrl: true, vertical: true },
  });

  return (
    <ProfileClient
      profileImageUrl={dealer?.profileImageUrl ?? null}
      currentVertical={dealer?.vertical ?? "automotive"}
    />
  );
}

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import VehicleEditForm from "./VehicleEditForm";

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const isSubscribed = await checkSubscription(session.user.id);
  if (!isSubscribed) {
    redirect("/subscribe");
  }

  const { id } = await params;

  const vehicle = await prisma.vehicle.findFirst({
    where: { id, dealerId: session.user.id },
  });

  if (!vehicle) {
    redirect("/dashboard");
  }

  return <VehicleEditForm vehicle={vehicle} />;
}

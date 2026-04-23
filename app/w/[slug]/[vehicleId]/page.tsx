import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LandingCarousel from "@/app/components/LandingCarousel";
import VehicleDetails from "@/app/components/VehicleDetails";
import StickyCTAs from "@/app/components/StickyCTAs";

export default async function VehicleLandingPage({
  params,
}: {
  params: Promise<{ slug: string; vehicleId: string }>;
}) {
  const { slug, vehicleId } = await params;

  const dealer = await prisma.dealer.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      phone: true,
      fbPageId: true,
      ctaPreference: true,
    },
  });

  if (!dealer) notFound();

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, dealerId: dealer.id },
    select: {
      make: true,
      model: true,
      year: true,
      price: true,
      mileageValue: true,
      stateOfVehicle: true,
      exteriorColor: true,
      trim: true,
      drivetrain: true,
      transmission: true,
      fuelType: true,
      msrp: true,
      url: true,
      address: true,
      imageUrl: true,
      images: true,
      description: true,
    },
  });

  if (!vehicle) notFound();

  const images = [vehicle.imageUrl, ...vehicle.images].filter(
    (u): u is string => Boolean(u)
  );

  return (
    <div className="min-h-screen bg-white">
      <LandingCarousel images={images} />
      <VehicleDetails vehicle={vehicle} dealer={dealer} />
      <StickyCTAs dealer={dealer} />
    </div>
  );
}

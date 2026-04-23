import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LandingCarousel from "@/app/components/LandingCarousel";
import VehicleDetails from "@/app/components/VehicleDetails";
import StickyCTAs from "@/app/components/StickyCTAs";
import SocialProof from "@/app/components/SocialProof";
import { getExtraImages } from "@/lib/getExtraImages";

export const revalidate = 3600; // cache for 1 hour

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
      vin: true,
      url: true,
      address: true,
      imageUrl: true,
      images: true,
      description: true,
    },
  });

  if (!vehicle) notFound();

  const baseImages = [vehicle.imageUrl, ...vehicle.images].filter(
    (u): u is string => Boolean(u)
  );

  const extraImages = vehicle.url ? await getExtraImages(vehicle.url) : [];
  const seen = new Set(baseImages);
  const allImages = [
    ...baseImages,
    ...extraImages.filter((u) => !seen.has(u)),
  ];

  return (
    <div className="min-h-screen bg-white">
      <LandingCarousel images={allImages} />
      <SocialProof />
      <VehicleDetails vehicle={{ ...vehicle, vin: vehicle.vin }} dealer={dealer} />
      <StickyCTAs dealer={dealer} />
    </div>
  );
}

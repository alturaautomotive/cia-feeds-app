import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const vehicles = await prisma.vehicle.findMany({
    where: { dealerId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      url: true,
      vin: true,
      make: true,
      model: true,
      year: true,
      bodyStyle: true,
      price: true,
      mileageValue: true,
      stateOfVehicle: true,
      exteriorColor: true,
      description: true,
      imageUrl: true,
      isComplete: true,
      missingFields: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ vehicles });
}

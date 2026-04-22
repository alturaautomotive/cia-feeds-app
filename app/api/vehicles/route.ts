import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";

export async function GET() {
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const vehicles = await prisma.vehicle.findMany({
    where: { dealerId },
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
      scrapeStatus: true,
      urlStatus: true,
      urlLastCheckedAt: true,
      urlCheckFailed: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ vehicles });
}

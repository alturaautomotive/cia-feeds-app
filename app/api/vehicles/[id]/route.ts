import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeCompleteness } from "@/lib/vehicleCompleteness";
import { Prisma } from "@prisma/client";

async function getVehicleForDealer(id: string, dealerId: string) {
  return prisma.vehicle.findFirst({
    where: { id, dealerId },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const vehicle = await getVehicleForDealer(id, session.user.id);
  if (!vehicle) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ vehicle });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const vehicle = await getVehicleForDealer(id, session.user.id);
  if (!vehicle) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  const stringFields = ["url", "vin", "make", "model", "year", "bodyStyle", "stateOfVehicle", "exteriorColor", "imageUrl", "description"] as const;
  const numericFields = ["price", "mileageValue"] as const;
  const requiredNonEmptyKeys: readonly string[] = ["make", "model", "year", "price", "stateOfVehicle", "url"];

  const validationErrors: Record<string, string> = {};

  for (const key of stringFields) {
    if (key in b) {
      const val = b[key];
      if (val !== null && typeof val !== "string") {
        validationErrors[key] = `${key} must be a string or null`;
      } else if (typeof val === "string" && requiredNonEmptyKeys.includes(key) && val.trim() === "") {
        validationErrors[key] = `${key} cannot be empty`;
      }
    }
  }

  for (const key of numericFields) {
    if (key in b) {
      const val = b[key];
      if (val !== null) {
        if (typeof val === "string") {
          const coerced = Number(val);
          if (!isFinite(coerced)) {
            validationErrors[key] = `${key} must be a finite number or null`;
          } else {
            b[key] = coerced;
          }
        } else if (typeof val !== "number" || !isFinite(val)) {
          validationErrors[key] = `${key} must be a finite number or null`;
        }
      }
    }
  }

  if (Object.keys(validationErrors).length > 0) {
    return NextResponse.json(
      { error: "validation_error", fields: validationErrors },
      { status: 400 }
    );
  }

  const allowed = [
    "url",
    "vin",
    "make",
    "model",
    "year",
    "bodyStyle",
    "price",
    "mileageValue",
    "stateOfVehicle",
    "exteriorColor",
    "imageUrl",
    "description",
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in b) {
      updates[key] = b[key];
    }
  }

  // Normalize year to string (Prisma schema defines Vehicle.year as String?)
  if ("year" in updates) {
    const yr = updates.year;
    if (typeof yr === "number") {
      updates.year = String(yr);
    }
    // non-string/non-null already rejected above
  }

  // Recompute isComplete and missingFields after update
  const merged = { ...vehicle, ...updates };
  const { isComplete, missingFields } = computeCompleteness(merged);
  updates.isComplete = isComplete;
  updates.missingFields = missingFields;

  let updated;
  try {
    updated = await prisma.vehicle.update({
      where: { id },
      data: updates,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "url_conflict", message: "A vehicle with this URL already exists for this dealer." },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({ vehicle: updated, missingFields });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const vehicle = await getVehicleForDealer(id, session.user.id);
  if (!vehicle) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.vehicle.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}

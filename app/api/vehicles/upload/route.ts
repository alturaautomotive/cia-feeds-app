import { NextRequest, NextResponse, after } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";
import { checkSubscription } from "@/lib/checkSubscription";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { dispatchFeedDeliveryInBackground } from "@/lib/metaDelivery";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const effectiveDealerId = await getEffectiveDealerId();
  if (!effectiveDealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isSubscribed = await checkSubscription(effectiveDealerId);
  if (!isSubscribed) {
    return NextResponse.json({ error: "subscription_required" }, { status: 403 });
  }

  const formData = await request.formData();
  const fileRaw = formData.get("file");
  const vehicleIdRaw = formData.get("vehicleId");

  if (!(fileRaw instanceof File)) {
    return NextResponse.json({ error: "file must be a file upload" }, { status: 400 });
  }
  if (typeof vehicleIdRaw !== "string" || !vehicleIdRaw) {
    return NextResponse.json({ error: "vehicleId must be a non-empty string" }, { status: 400 });
  }

  const file = fileRaw;
  const vehicleId = vehicleIdRaw;

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, dealerId: effectiveDealerId },
  });
  if (!vehicle) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be 5 MB or smaller" }, { status: 400 });
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-]/g, "_");
  const path = `${vehicleId}/${Date.now()}-${sanitizedName}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabaseAdmin.storage
    .from("vehicle-images")
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: "Upload failed", details: uploadError.message }, { status: 502 });
  }

  const { data } = supabaseAdmin.storage.from("vehicle-images").getPublicUrl(path);

  const publicUrl = data.publicUrl;

  let updatedVehicle;
  try {
    updatedVehicle = await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        images: { push: publicUrl },
        imageUrl: vehicle.images.length === 0 ? publicUrl : undefined,
      },
    });
  } catch (dbError) {
    await supabaseAdmin.storage.from("vehicle-images").remove([path]);
    return NextResponse.json(
      { error: "Database update failed", details: dbError instanceof Error ? dbError.message : "Unknown error" },
      { status: 500 }
    );
  }

  dispatchFeedDeliveryInBackground(effectiveDealerId, "vehicles/upload", after);

  return NextResponse.json({ url: publicUrl, images: updatedVehicle.images });
}

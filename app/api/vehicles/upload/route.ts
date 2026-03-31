import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
    where: { id: vehicleId, dealerId: session.user.id },
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

  return NextResponse.json({ url: data.publicUrl });
}

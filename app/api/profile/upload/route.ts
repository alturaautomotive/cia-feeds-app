import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";
import { checkSubscription } from "@/lib/checkSubscription";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isSubscribed = await checkSubscription(session.user.id);
  if (!isSubscribed) {
    return NextResponse.json({ error: "subscription_required" }, { status: 403 });
  }

  const formData = await request.formData();
  const fileRaw = formData.get("file");

  if (!(fileRaw instanceof File)) {
    return NextResponse.json({ error: "file must be a file upload" }, { status: 400 });
  }

  const file = fileRaw;

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be 5 MB or smaller" }, { status: 400 });
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-]/g, "_");
  const path = `profiles/${session.user.id}-${Date.now()}-${sanitizedName}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabaseAdmin.storage
    .from("vehicle-images")
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: "Upload failed", details: uploadError.message }, { status: 502 });
  }

  const { data } = supabaseAdmin.storage.from("vehicle-images").getPublicUrl(path);

  try {
    await prisma.dealer.update({
      where: { id: session.user.id },
      data: { profileImageUrl: data.publicUrl },
    });
  } catch (dbError) {
    await supabaseAdmin.storage.from("vehicle-images").remove([path]);
    return NextResponse.json({ error: "Failed to save profile image", details: (dbError as Error).message }, { status: 500 });
  }

  return NextResponse.json({ profileImageUrl: data.publicUrl });
}

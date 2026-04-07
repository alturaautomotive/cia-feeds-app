import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkSubscription } from "@/lib/checkSubscription";
import { supabaseAdmin } from "@/lib/supabase";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGES = 10;

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
  const files = formData.getAll("files");

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  if (files.length > MAX_IMAGES) {
    return NextResponse.json({ error: `Maximum ${MAX_IMAGES} images allowed` }, { status: 400 });
  }

  const urls: string[] = [];

  for (const fileRaw of files) {
    if (!(fileRaw instanceof File)) {
      return NextResponse.json({ error: "Each file must be a file upload" }, { status: 400 });
    }

    if (!fileRaw.type.startsWith("image/")) {
      return NextResponse.json({ error: `File "${fileRaw.name}" is not an image` }, { status: 400 });
    }

    if (fileRaw.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File "${fileRaw.name}" exceeds 5 MB limit` }, { status: 400 });
    }

    const sanitizedName = fileRaw.name.replace(/[^a-zA-Z0-9.\-]/g, "_");
    const path = `listings/${session.user.id}/${Date.now()}-${sanitizedName}`;

    const arrayBuffer = await fileRaw.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabaseAdmin.storage
      .from("vehicle-images")
      .upload(path, buffer, { contentType: fileRaw.type, upsert: false });

    if (uploadError) {
      return NextResponse.json(
        { error: "Upload failed", details: uploadError.message },
        { status: 502 }
      );
    }

    const { data } = supabaseAdmin.storage.from("vehicle-images").getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return NextResponse.json({ urls });
}

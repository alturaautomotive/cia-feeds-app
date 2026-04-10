import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkSubscription } from "@/lib/checkSubscription";
import { supabaseAdmin } from "@/lib/supabase";
import { getEffectiveDealerId } from "@/lib/impersonation";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGES = 10;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isSubscribed = await checkSubscription(dealerId);
  if (!isSubscribed) {
    return NextResponse.json({ error: "subscription_required" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    console.error({
      event: "upload_formdata_parse_error",
      message: err instanceof Error ? err.message : String(err),
      contentType: request.headers.get("content-type"),
    });
    return NextResponse.json({ error: "Failed to parse form data" }, { status: 400 });
  }

  const files = formData.getAll("files");

  if (files.length === 0) {
    console.warn({
      event: "upload_no_files",
      contentType: request.headers.get("content-type"),
    });
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
    const path = `listings/${dealerId}/${Date.now()}-${sanitizedName}`;

    try {
      const arrayBuffer = await fileRaw.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadError } = await supabaseAdmin.storage
        .from("vehicle-images")
        .upload(path, buffer, { contentType: fileRaw.type, upsert: false });

      if (uploadError) {
        console.error({
          event: "upload_storage_error",
          path,
          message: uploadError.message,
        });
        return NextResponse.json(
          { error: "Upload failed", details: uploadError.message },
          { status: 502 }
        );
      }

      const { data } = supabaseAdmin.storage.from("vehicle-images").getPublicUrl(path);
      urls.push(data.publicUrl);
    } catch (err) {
      console.error({
        event: "upload_storage_exception",
        path,
        message: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: "Upload failed", details: err instanceof Error ? err.message : String(err) },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ urls });
}

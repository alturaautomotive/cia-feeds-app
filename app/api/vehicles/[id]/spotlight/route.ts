import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const vehicle = await prisma.vehicle.findFirst({
    where: { id, dealerId: session.user.id },
  });
  if (!vehicle) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: session.user.id },
    select: { profileImageUrl: true },
  });

  if (!dealer?.profileImageUrl) {
    return NextResponse.json({ error: "no_profile_image" }, { status: 400 });
  }

  const vehicleImageUrl = vehicle.images[0] ?? vehicle.imageUrl;
  if (!vehicleImageUrl) {
    return NextResponse.json({ error: "no_vehicle_image" }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // body is optional
  }
  const signMessage = typeof body.signMessage === "string" ? body.signMessage : undefined;

  // Fetch vehicle image
  let vehicleBase64: string;
  let vehicleMimeType: string;
  try {
    const vehicleImageRes = await fetch(vehicleImageUrl);
    if (!vehicleImageRes.ok) {
      return NextResponse.json({ error: "generation_failed", details: "vehicle_image_fetch_failed" }, { status: 502 });
    }
    const contentType = vehicleImageRes.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "generation_failed", details: "vehicle_image_invalid_type" }, { status: 502 });
    }
    const vehicleArrayBuffer = await vehicleImageRes.arrayBuffer();
    vehicleBase64 = Buffer.from(vehicleArrayBuffer).toString("base64");
    vehicleMimeType = contentType;
  } catch {
    return NextResponse.json({ error: "generation_failed", details: "vehicle_image_unreachable" }, { status: 502 });
  }

  // Fetch profile image
  let profileBase64: string;
  let profileMimeType: string;
  try {
    const profileImageRes = await fetch(dealer.profileImageUrl);
    if (!profileImageRes.ok) {
      return NextResponse.json({ error: "generation_failed", details: "profile_image_fetch_failed" }, { status: 502 });
    }
    const contentType = profileImageRes.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "generation_failed", details: "profile_image_invalid_type" }, { status: 502 });
    }
    const profileArrayBuffer = await profileImageRes.arrayBuffer();
    profileBase64 = Buffer.from(profileArrayBuffer).toString("base64");
    profileMimeType = contentType;
  } catch {
    return NextResponse.json({ error: "generation_failed", details: "profile_image_unreachable" }, { status: 502 });
  }

  // Build prompt
  const signPart = signMessage
    ? `The person is holding a rectangular sign at chest height with both hands gripping the sides naturally. The sign reads: '${signMessage}'. Both arms are bent at the elbows at a natural angle, wrists straight, fingers wrapped around the sign edges. The sign is level and facing the camera.`
    : "The person has one arm relaxed at their side and the other raised with a natural thumbs-up gesture — elbow slightly bent, wrist straight, thumb pointing upward, remaining fingers loosely curled. No awkward bends or unnatural joint angles.";
  const promptText = `You are compositing a person into an existing car photo. Rules:
1. The car photo (first image) must remain completely unchanged — same background, lighting, colors, and perspective.
2. Place the person from the second image standing upright beside the car on the ground plane, as if they were physically present at the same location.
3. The person must have correct human anatomy: straight spine, shoulders level, arms hanging or posed naturally from the shoulder joints, elbows bent at realistic angles, wrists aligned with forearms, hands with all five fingers visible and naturally positioned — no extra fingers, no missing fingers, no twisted wrists, no floating hands.
4. ${signPart}
5. The person's feet must be on the ground, legs straight or slightly relaxed, no floating or cropped legs unless the car naturally occludes them.
6. Lighting on the person must match the car photo's light direction and color temperature.
7. Output a single photorealistic image combining both elements seamlessly.`;

  const contents = [
    { inlineData: { mimeType: vehicleMimeType, data: vehicleBase64 } },
    { inlineData: { mimeType: profileMimeType, data: profileBase64 } },
    { text: promptText },
  ];

  const geminiApiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!geminiApiKey) {
    return NextResponse.json({ error: "misconfigured_gemini" }, { status: 500 });
  }

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents,
      config: {
        responseModalities: ["Image"],
      },
    });
  } catch {
    return NextResponse.json({ error: "generation_failed" }, { status: 502 });
  }

  const imagePart = response.candidates?.[0]?.content?.parts?.find(
    (p: { inlineData?: { data?: string } }) => p.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    return NextResponse.json({ error: "generation_failed" }, { status: 502 });
  }

  const resultBuffer = Buffer.from(imagePart.inlineData.data, "base64");

  let resizedBuffer: Buffer;
  try {
    resizedBuffer = await sharp(resultBuffer)
      .resize(1080, 1080, { fit: "cover", position: "center" })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "generation_failed" }, { status: 502 });
  }

  const storagePath = `spotlights/${vehicle.id}-${Date.now()}.jpg`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from("vehicle-images")
    .upload(storagePath, resizedBuffer, { contentType: "image/jpeg", upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: "upload_failed", details: uploadError.message }, { status: 502 });
  }

  const { data } = supabaseAdmin.storage.from("vehicle-images").getPublicUrl(storagePath);

  try {
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { spotlightImageUrl: data.publicUrl },
    });
  } catch {
    await supabaseAdmin.storage.from("vehicle-images").remove([storagePath]);
    return NextResponse.json({ error: "db_update_failed" }, { status: 500 });
  }

  return NextResponse.json({ spotlightImageUrl: data.publicUrl });
}

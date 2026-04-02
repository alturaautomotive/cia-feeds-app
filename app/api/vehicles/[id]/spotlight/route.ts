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
1. IDENTITY PRESERVATION — HIGHEST PRIORITY. The person in the output image MUST be the exact same individual shown in the first image. Reproduce their face shape, facial features, skin tone, eye color, hair color, hair style, and hair length with pixel-accurate fidelity. Preserve all distinguishing marks including freckles, scars, moles, and tattoos exactly as they appear — do NOT remove, alter, or obscure any of them. Do NOT generate a new person. Do NOT alter, idealise, or approximate their appearance in any way.
2. The car photo (second image) must remain completely unchanged — same background, lighting, colors, and perspective. Do not modify, recolor, or reframe the vehicle scene.
3. Place that exact person standing upright beside the car on the ground plane, full body visible, as if they were physically present at the same location.
4. Correct human anatomy throughout: straight spine, level shoulders, arms hanging or posed naturally from the shoulder joints, elbows at realistic angles, wrists aligned with forearms, all five fingers naturally positioned — no extra fingers, no missing fingers, no twisted wrists, no floating hands.
5. ${signPart}
6. Feet flat on the ground, legs straight or slightly relaxed — no floating or cropped legs unless the car naturally occludes them.
7. Lighting on the person must match the car photo's light direction and color temperature exactly.
8. Output a single seamless photorealistic composite image.`;

  const contents = [
    { inlineData: { mimeType: profileMimeType, data: profileBase64 } },
    { inlineData: { mimeType: vehicleMimeType, data: vehicleBase64 } },
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

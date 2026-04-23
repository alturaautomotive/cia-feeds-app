import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendNewLeadEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const rl = rateLimit(`lead:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { name, email, phone, vehicleId, dealerId } = body as Record<string, unknown>;

  if (!name || typeof name !== "string" || !vehicleId || typeof vehicleId !== "string" || !dealerId || typeof dealerId !== "string") {
    return NextResponse.json({ error: "name, vehicleId, and dealerId are required" }, { status: 400 });
  }

  if (email != null && typeof email !== "string") {
    return NextResponse.json({ error: "email must be a string" }, { status: 400 });
  }
  if (phone != null && typeof phone !== "string") {
    return NextResponse.json({ error: "phone must be a string" }, { status: 400 });
  }

  try {
    const lead = await prisma.lead.create({
      data: {
        name: name.trim(),
        email: typeof email === "string" ? email.trim() : undefined,
        phone: typeof phone === "string" ? phone.trim() : undefined,
        vehicleId,
        dealerId,
      },
    });

    const dealer = await prisma.dealer.findUnique({
      where: { id: dealerId },
      select: { email: true, metaPixelId: true },
    });

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { make: true, model: true, year: true, description: true, price: true },
    });

    if (dealer && vehicle) {
      const vehicleInfo =
        [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
        (vehicle.description?.slice(0, 100) ?? "Vehicle");

      sendNewLeadEmail(
        dealer.email,
        name.trim(),
        typeof email === "string" ? email.trim() : undefined,
        typeof phone === "string" ? phone.trim() : undefined,
        vehicleInfo
      ).catch((err) => console.error("[leads] email notification failed:", err));

      // Fire server-side Meta CAPI Lead event
      if (dealer?.metaPixelId && vehicle?.price != null) {
        fetch('/api/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pixelId: dealer.metaPixelId,
            eventName: 'Lead',
            data: {
              content_ids: [vehicleId],
              value: vehicle.price,
              currency: 'USD'
            },
            dealerId: dealerId
          })
        }).catch((err) => console.error('[leads] track error:', err));
      }
    }

    return NextResponse.json({ success: true, leadId: lead.id }, { status: 201 });
  } catch (err) {
    console.error("[leads] Error creating lead:", err);
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: "lead_creation_failed", detail: message }, { status: 500 });
  }
}

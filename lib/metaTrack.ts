import { prisma } from "@/lib/prisma";
import { decryptToken, graphFetch } from "@/lib/meta";

/**
 * Send a Meta Conversions API event server-side.
 * This is extracted from app/api/track/route.ts so it can be called
 * directly from other server code without an HTTP round-trip.
 */
export async function sendMetaEvent({
  pixelId,
  eventName,
  data,
  dealerId,
}: {
  pixelId: string;
  eventName: string;
  data?: Record<string, unknown>;
  dealerId: string;
}): Promise<void> {
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { metaAccessToken: true, metaPixelId: true },
  });

  if (!dealer) return;
  if (pixelId !== dealer.metaPixelId) return;
  if (!dealer.metaAccessToken && !process.env.META_PUBLIC_ACCESS_TOKEN) return;

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        custom_data: data ?? {},
      },
    ],
  };

  const token = dealer.metaAccessToken
    ? decryptToken(dealer.metaAccessToken)
    : process.env.META_PUBLIC_ACCESS_TOKEN!;

  const res = await graphFetch(
    `/${encodeURIComponent(pixelId)}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    token
  );

  if (!res.ok) {
    const errBody = await res.text();
    console.error("[metaTrack] Meta CAPI error:", res.status, errBody);
  }
}

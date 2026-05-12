import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { generateTrackingSecret } from "@/lib/trackingSignature";
import { writeAuditLog } from "@/lib/adminAudit";

/**
 * GET   /api/dealer/tracking-secret  -> { trackingSecret }
 *   Returns the dealer's signing secret. Lazily generated on first read.
 *
 * POST  /api/dealer/tracking-secret  -> { trackingSecret } (rotated)
 *   Rotate the secret (invalidates any embed snippets currently in use).
 *
 * Both require an authenticated dealer session (SECURITY_AUDIT.md F-2.6).
 */

async function readOrCreateSecret(dealerId: string): Promise<string> {
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { trackingSecret: true },
  });
  if (dealer?.trackingSecret) return dealer.trackingSecret;
  const secret = generateTrackingSecret();
  await prisma.dealer.update({
    where: { id: dealerId },
    data: { trackingSecret: secret },
  });
  return secret;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const secret = await readOrCreateSecret(dealerId);
  return NextResponse.json({ trackingSecret: secret });
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const secret = generateTrackingSecret();
  await prisma.dealer.update({
    where: { id: dealerId },
    data: { trackingSecret: secret },
  });
  await writeAuditLog({
    action: "dealer.tracking_secret.rotate",
    actorEmail: session.user.email ?? "unknown",
    actorRole: "dealer",
    actorDealerId: dealerId,
    targetDealerId: dealerId,
  }).catch(() => {});
  return NextResponse.json({ trackingSecret: secret });
}

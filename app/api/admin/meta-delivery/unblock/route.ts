import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/auth";
import { criticalDurableRateLimit } from "@/lib/rateLimit";
import { adminMetaDeliveryUnblockSchema } from "@/lib/requestSchemas";
import { unblockDealerJobs } from "@/lib/metaDelivery";
import { writeAuditLog } from "@/lib/adminAudit";

export async function POST(request: NextRequest) {
  // Pre-auth rate limit (IP-scoped)
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const rl = await criticalDurableRateLimit(`admin-meta-delivery-unblock:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }

  // Admin authorization
  const auth = await adminGuard("manage_delivery");
  if (!auth.ok) return auth.response!;

  // Post-auth actor-scoped rate limit
  const actorRl = await criticalDurableRateLimit(
    `admin-meta-delivery-unblock:actor:${auth.email}:${ip}`,
    20,
    60_000
  );
  if (!actorRl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: actorRl.retryAfterMs }, { status: 429 });
  }

  // Validate body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = adminMetaDeliveryUnblockSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { dealerId } = parsed.data;

  // Look up dealer
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { id: true },
  });
  if (!dealer) {
    return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
  }

  try {
    // Capture pre-state
    const previousBlockedJobs = await prisma.metaDeliveryJob.count({
      where: { dealerId, status: "blocked" },
    });

    const unblockedCount = await unblockDealerJobs(dealerId);

    await writeAuditLog({
      action: "admin.meta_delivery.unblock",
      actorEmail: auth.email,
      actorRole: auth.role,
      targetDealerId: dealerId,
      beforeState: { blockedJobs: previousBlockedJobs },
      afterState: { unblockedCount },
      metadata: { dealerId },
    });

    return NextResponse.json({ ok: true, unblockedCount });
  } catch (err) {
    console.error("[admin/meta-delivery/unblock] error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

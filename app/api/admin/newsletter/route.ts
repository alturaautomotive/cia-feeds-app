// /api/admin/newsletter
//
//   GET    -> list NewsletterSubscriber rows (decrypted summary for admin
//             view). Supports ?q=, ?source=, ?locale=, ?status=
//             (active|unsubscribed), ?limit=, ?offset=.
//   DELETE -> hard-delete a subscriber row by ?id=.
//
// Email is encrypted at rest via lib/leadCrypto. The list endpoint
// decrypts for display; the response is not cached and only reachable by
// super_admin via manage_accounts. Unsubscribing (without deletion) goes
// through the public /api/newsletter/unsubscribe?token= endpoint instead.

import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/adminAudit";
import { decryptLeadField } from "@/lib/leadCrypto";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await adminGuard("manage_accounts");
  if (!guard.ok) return guard.response!;

  const sp = request.nextUrl.searchParams;
  const q = sp.get("q")?.trim().toLowerCase() ?? "";
  const source = sp.get("source")?.trim() ?? "";
  const locale = sp.get("locale")?.trim() ?? "";
  const status = sp.get("status")?.trim() ?? "";
  const limit = Math.min(parseInt(sp.get("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0);

  // Status filter maps to unsubscribedAt nullability.
  const where: Record<string, unknown> = {};
  if (source) where.source = source;
  if (locale) where.locale = locale;
  if (status === "active") where.unsubscribedAt = null;
  else if (status === "unsubscribed") where.unsubscribedAt = { not: null };

  const [rows, total] = await Promise.all([
    prisma.newsletterSubscriber.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.newsletterSubscriber.count({ where }),
  ]);

  // Decrypt for display. We then apply `q` after decryption so the search
  // can match emails (since the stored column is ciphertext). This means
  // q-filter is applied to the CURRENT page only \u2014 fine for an admin
  // page since they'll paginate / refine other filters first.
  const decrypted = rows.map((r) => {
    const email = decryptLeadField(r.email) ?? "";
    const name = r.name ? decryptLeadField(r.name) : null;
    const phone = r.phone ? decryptLeadField(r.phone) : null;
    return {
      id: r.id,
      email,
      name,
      phone,
      source: r.source,
      interest: r.interest,
      locale: r.locale,
      unsubscribedAt: r.unsubscribedAt,
      lastEmailedAt: r.lastEmailedAt,
      createdAt: r.createdAt,
    };
  });

  const filtered = q
    ? decrypted.filter(
        (r) =>
          r.email.toLowerCase().includes(q) ||
          (r.name ?? "").toLowerCase().includes(q)
      )
    : decrypted;

  return NextResponse.json({
    subscribers: filtered,
    total,
    limit,
    offset,
  });
}

export async function DELETE(request: NextRequest) {
  const guard = await adminGuard("manage_accounts");
  if (!guard.ok) return guard.response!;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const sub = await prisma.newsletterSubscriber.findUnique({
    where: { id },
    select: {
      id: true,
      emailHash: true,
      source: true,
      interest: true,
      locale: true,
      unsubscribedAt: true,
    },
  });
  if (!sub) {
    return NextResponse.json({ error: "subscriber_not_found" }, { status: 404 });
  }

  await prisma.newsletterSubscriber.delete({ where: { id } });

  await writeAuditLog({
    action: "newsletter_subscriber_deleted",
    actorEmail: guard.email,
    actorRole: guard.role,
    actorDealerId: null,
    targetDealerId: null,
    beforeState: {
      subscriberId: sub.id,
      source: sub.source,
      interest: sub.interest,
      locale: sub.locale,
      unsubscribedAt: sub.unsubscribedAt,
      // Email NOT logged \u2014 stays only in the encrypted DB row, which we've
      // just deleted. emailHash is a one-way hash so it's fine to keep.
      emailHash: sub.emailHash,
    },
    afterState: { deleted: true },
    metadata: { note: "deleted via /admin/newsletter" },
  });

  return NextResponse.json({ ok: true, id });
}

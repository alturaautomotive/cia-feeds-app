import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { criticalDurableRateLimit } from "@/lib/rateLimit";
import { writeAuditLog } from "@/lib/adminAudit";
import {
  attachDomainToProject,
  detachDomainFromProject,
  getDomainStatus,
  VercelDomainsNotConfigured,
} from "@/lib/vercelDomains";

/**
 * Custom-domain CRUD for the authenticated dealer.
 *
 * GET    -> { customDomain, status?: { verified, verification, hasCertificate } }
 * POST   -> attach a new domain. Body: { domain: "inventory.dealer.com" }
 * DELETE -> remove. Body: none.
 *
 * Domain format rules:
 *   - lowercase letters/digits/hyphens/dots only
 *   - max 253 chars
 *   - must include at least one dot (no apex single labels)
 *   - reserved roots (ciafeed.com, vercel.app, etc.) are blocked
 *
 * Audit-logged on every state change.
 */

const RESERVED_ROOTS = new Set([
  "ciafeed.com",
  "vercel.app",
  "vercel.com",
  "supabase.co",
  "supabase.com",
  "localhost",
]);

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function validateDomain(raw: unknown): { ok: true; domain: string } | { ok: false; reason: string } {
  if (typeof raw !== "string") return { ok: false, reason: "domain_required" };
  const d = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (d.length > 253) return { ok: false, reason: "domain_too_long" };
  if (!DOMAIN_RE.test(d)) return { ok: false, reason: "domain_invalid_format" };
  for (const root of RESERVED_ROOTS) {
    if (d === root || d.endsWith(`.${root}`)) return { ok: false, reason: `domain_reserved:${root}` };
  }
  return { ok: true, domain: d };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { customDomain: true },
  });
  if (!dealer?.customDomain) return NextResponse.json({ customDomain: null });

  let status: Awaited<ReturnType<typeof getDomainStatus>> | null = null;
  try {
    status = await getDomainStatus(dealer.customDomain);
  } catch (err) {
    if (!(err instanceof VercelDomainsNotConfigured)) {
      console.error({ event: "domain_status_failed", err: String(err) });
    }
    // Best-effort \u2014 return the local state even if Vercel lookup fails.
  }

  return NextResponse.json({ customDomain: dealer.customDomain, status });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const rl = await criticalDurableRateLimit(`domain:${dealerId}:${ip}`, 3, 24 * 60 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }

  let body: { domain?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const validation = validateDomain(body.domain);
  if (!validation.ok) return NextResponse.json({ error: validation.reason }, { status: 400 });
  const { domain } = validation;

  // Check uniqueness — partial-unique index on customDomain will also catch
  // this, but we pre-check to give a friendlier error.
  const conflict = await prisma.dealer.findFirst({
    where: { customDomain: domain, NOT: { id: dealerId } },
    select: { id: true },
  });
  if (conflict) return NextResponse.json({ error: "domain_taken" }, { status: 409 });

  // Attach to Vercel (best-effort; we still save the DB row so the dealer can
  // continue the wizard even if VERCEL_API_TOKEN isn't provisioned).
  let vercelStatus: Awaited<ReturnType<typeof attachDomainToProject>> | null = null;
  let vercelError: string | null = null;
  try {
    vercelStatus = await attachDomainToProject(domain);
  } catch (err) {
    if (err instanceof VercelDomainsNotConfigured) {
      vercelError = "vercel_api_not_configured";
    } else {
      console.error({ event: "vercel_attach_failed", domain, err: String(err) });
      vercelError = err instanceof Error ? err.message : String(err);
    }
  }

  await prisma.dealer.update({
    where: { id: dealerId },
    data: { customDomain: domain },
  });

  await writeAuditLog({
    action: "dealer.domain.add",
    actorEmail: session.user.email ?? "unknown",
    actorRole: "dealer",
    actorDealerId: dealerId,
    targetDealerId: dealerId,
    metadata: { domain, vercelAttached: vercelStatus !== null, vercelError },
  }).catch(() => {});

  return NextResponse.json({ ok: true, customDomain: domain, status: vercelStatus, vercelError });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { customDomain: true },
  });
  if (!dealer?.customDomain) return NextResponse.json({ ok: true });

  const domain = dealer.customDomain;
  let vercelError: string | null = null;
  try {
    await detachDomainFromProject(domain);
  } catch (err) {
    if (!(err instanceof VercelDomainsNotConfigured)) {
      console.error({ event: "vercel_detach_failed", domain, err: String(err) });
      vercelError = err instanceof Error ? err.message : String(err);
    }
  }

  await prisma.dealer.update({
    where: { id: dealerId },
    data: { customDomain: null },
  });

  await writeAuditLog({
    action: "dealer.domain.remove",
    actorEmail: session.user.email ?? "unknown",
    actorRole: "dealer",
    actorDealerId: dealerId,
    targetDealerId: dealerId,
    metadata: { domain, vercelError },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

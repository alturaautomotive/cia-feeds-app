export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

/**
 * Daily Meta delivery health check (SECURITY_AUDIT.md F-2.5).
 *
 * Surveys the MetaDeliveryJob table for stuck/failed/blocked jobs and emails
 * the admin if any thresholds are exceeded. Without this, a dealer's Meta
 * delivery can silently fail for days — by design the queue retries 5x then
 * gives up, but nothing alerts when give-up happens.
 *
 * Thresholds (tuned conservatively to avoid noise):
 *   - blocked count   > 0         -> always alert (auth-failure circuit open)
 *   - failed in 24h   > 0         -> always alert (post-retry give-up)
 *   - retry > 1h old  > 0         -> alert (stuck job; lease orphaned)
 *
 * Auth: standard CRON_SECRET bearer (same as other crons).
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [blockedJobs, recentFailed, stuckRetry, blockedDealers] = await Promise.all([
    prisma.metaDeliveryJob.findMany({
      where: { status: "blocked" },
      select: {
        id: true,
        dealerId: true,
        lastErrorCode: true,
        lastErrorMessage: true,
        updatedAt: true,
        dealer: { select: { name: true, email: true } },
      },
      take: 50,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.metaDeliveryJob.findMany({
      where: { status: "failed", updatedAt: { gte: oneDayAgo } },
      select: {
        id: true,
        dealerId: true,
        attemptCount: true,
        lastErrorMessage: true,
        updatedAt: true,
        dealer: { select: { name: true, email: true } },
      },
      take: 50,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.metaDeliveryJob.findMany({
      where: { status: "retry", nextRunAt: { lt: oneHourAgo } },
      select: { id: true, dealerId: true, attemptCount: true, nextRunAt: true },
      take: 50,
    }),
    // Aggregate dealers blocked from delivery entirely (good leading indicator).
    prisma.dealer.findMany({
      where: { metaDeliveryMethod: "blocked" },
      select: { id: true, name: true, email: true, metaConnectedAt: true },
      take: 50,
    }),
  ]);

  const totals = {
    blockedJobs: blockedJobs.length,
    recentFailedJobs: recentFailed.length,
    stuckRetryJobs: stuckRetry.length,
    blockedDealers: blockedDealers.length,
  };

  const shouldAlert =
    totals.blockedJobs > 0 ||
    totals.recentFailedJobs > 0 ||
    totals.stuckRetryJobs > 0 ||
    totals.blockedDealers > 0;

  if (!shouldAlert) {
    return NextResponse.json({ ok: true, alerted: false, totals });
  }

  // Compose admin alert email.
  const adminEmail = process.env.ADMIN_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  if (!adminEmail || !resendKey) {
    // Log so the cron's failure mode is visible without bringing down the run.
    console.warn({
      event: "delivery_health_alert_skipped",
      reason: !adminEmail ? "no_admin_email" : "no_resend_key",
      totals,
    });
    return NextResponse.json({ ok: true, alerted: false, reason: "no_email_config", totals });
  }

  function renderList<T>(rows: T[], render: (r: T) => string): string {
    if (rows.length === 0) return "";
    return `<ul>${rows.map(render).join("")}</ul>`;
  }

  const html = `
    <h2>CIA Feeds — Daily Meta Delivery Health</h2>
    <p>Threshold exceeded. Action required.</p>
    <h3>Blocked jobs (${totals.blockedJobs})</h3>
    ${renderList(blockedJobs, (j) =>
      `<li>${escapeHtml(j.dealer?.name ?? "?")} (${escapeHtml(j.dealer?.email ?? "?")}) — ${escapeHtml(j.lastErrorCode ?? "")}: ${escapeHtml((j.lastErrorMessage ?? "").slice(0, 200))}</li>`
    )}
    <h3>Failed in last 24h (${totals.recentFailedJobs})</h3>
    ${renderList(recentFailed, (j) =>
      `<li>${escapeHtml(j.dealer?.name ?? "?")} after ${j.attemptCount} attempts — ${escapeHtml((j.lastErrorMessage ?? "").slice(0, 200))}</li>`
    )}
    <h3>Stuck in retry > 1h (${totals.stuckRetryJobs})</h3>
    ${renderList(stuckRetry, (j) =>
      `<li>job ${j.id.slice(0, 8)} (dealer ${j.dealerId.slice(0, 8)}, attempt ${j.attemptCount}, next run ${j.nextRunAt.toISOString()})</li>`
    )}
    <h3>Dealers with metaDeliveryMethod=blocked (${totals.blockedDealers})</h3>
    ${renderList(blockedDealers, (d) =>
      `<li>${escapeHtml(d.name)} (${escapeHtml(d.email)})</li>`
    )}
    <p>Investigate at <a href="${escapeHtml(process.env.NEXTAUTH_URL ?? "https://www.ciafeed.com")}/admin">the admin dashboard</a>.</p>
  `;

  const resend = new Resend(resendKey);
  try {
    await resend.emails.send({
      from: "CIA Feeds <noreply@ciafeed.com>",
      to: adminEmail,
      subject: `[CIA Feeds] Delivery health alert — ${totals.blockedJobs}b/${totals.recentFailedJobs}f/${totals.stuckRetryJobs}r`,
      html,
    });
  } catch (err) {
    console.error({
      event: "delivery_health_alert_email_failed",
      message: err instanceof Error ? err.message : String(err),
      totals,
    });
    return NextResponse.json({ ok: false, error: "email_failed", totals }, { status: 500 });
  }

  return NextResponse.json({ ok: true, alerted: true, totals });
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => HTML[c] ?? c);
}
const HTML: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

// Public newsletter / landing-page lead capture.
//
// Single endpoint for all marketing-site signups: blog index footer, blog
// post sidebar, landing pages /lp/[slug], and pillar pages. We discriminate
// by the `source` and `interest` fields the client sends, so we don't need
// one route per surface.
//
// Email is encrypted at rest (lib/leadCrypto.ts, SECURITY_AUDIT.md F-8.4),
// dedup is by SHA-256 hash of the lowercased email so the unique index can
// work without touching ciphertext.
//
// Resubscribes are honoured: if a row exists with `unsubscribedAt` set, we
// clear it and update the source/interest to the most recent signup.

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { sendEmail, esc } from "@/lib/email";
import { encryptLeadField, encryptLeadFieldNullable } from "@/lib/leadCrypto";
import { durableRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const VALID_LOCALES = new Set(["en", "es"]);

function hashEmail(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function isValidEmail(s: string): boolean {
  // Conservative pattern: must have an @ and a TLD-shaped suffix. Real
  // validation happens via the welcome email; we just guard the obvious.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;
}

export async function POST(request: NextRequest) {
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown")
    .split(",")[0]
    .trim();
  const rl = await durableRateLimit(`newsletter:${ip}`, 8, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const emailRaw = typeof body.email === "string" ? body.email.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : null;
  const phone =
    typeof body.phone === "string" ? body.phone.trim().slice(0, 32) : null;
  const source =
    typeof body.source === "string" && body.source.length > 0
      ? body.source.slice(0, 60)
      : "unknown";
  const interest =
    typeof body.interest === "string" && body.interest.length > 0
      ? body.interest.slice(0, 60)
      : null;
  const locale =
    typeof body.locale === "string" && VALID_LOCALES.has(body.locale)
      ? body.locale
      : "en";

  if (!emailRaw || !isValidEmail(emailRaw)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const emailHash = hashEmail(emailRaw);

  // Look up by hash. If exists and currently unsubscribed, resubscribe and
  // refresh source/interest. If exists and active, treat as no-op (idempotent
  // signup so a refresh-and-resubmit doesn't error).
  const existing = await prisma.newsletterSubscriber.findUnique({
    where: { emailHash },
    select: { id: true, unsubscribedAt: true },
  });

  const encryptedEmail = encryptLeadField(emailRaw);
  const encryptedName = encryptLeadFieldNullable(name);
  const encryptedPhone = encryptLeadFieldNullable(phone);

  if (existing) {
    await prisma.newsletterSubscriber.update({
      where: { id: existing.id },
      data: {
        email: encryptedEmail,
        ...(encryptedName !== null ? { name: encryptedName } : {}),
        ...(encryptedPhone !== null ? { phone: encryptedPhone } : {}),
        source,
        interest,
        locale,
        unsubscribedAt: null,
      },
    });
  } else {
    await prisma.newsletterSubscriber.create({
      data: {
        email: encryptedEmail,
        emailHash,
        name: encryptedName,
        phone: encryptedPhone,
        source,
        interest,
        locale,
      },
    });
  }

  // Send a welcome email (best-effort; failures don't fail the request).
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      const subject =
        locale === "es"
          ? "Bienvenido a CIAfeeds"
          : "Welcome to CIAfeeds";
      const greeting =
        locale === "es"
          ? `Hola${name ? " " + esc(name) : ""},`
          : `Hi${name ? " " + esc(name) : ""},`;
      const intro =
        locale === "es"
          ? `Gracias por suscribirte. Cada dos semanas te enviar\u00e9 una idea pr\u00e1ctica sobre marketing en WhatsApp y captura de leads para concesionarios. Sin spam, sin relleno.`
          : `Thanks for subscribing. Every two weeks I'll send you one practical idea on WhatsApp marketing and lead capture for dealerships. No spam, no filler.`;
      const cta =
        locale === "es"
          ? `Mientras tanto, echa un vistazo a CIAfeeds: <a href="https://www.ciafeed.com/marketing-whatsapp-concesionarios">https://www.ciafeed.com/marketing-whatsapp-concesionarios</a>`
          : `In the meantime, take a look at CIAfeeds: <a href="https://www.ciafeed.com/whatsapp-marketing-dealerships">https://www.ciafeed.com/whatsapp-marketing-dealerships</a>`;
      const html = `
        <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #0F172A;">
          <p>${greeting}</p>
          <p>${intro}</p>
          <p>${cta}</p>
          <p style="margin-top: 32px; font-size: 12px; color: #64748B;">
            ${locale === "es" ? "Puedes darte de baja en cualquier momento desde el pie de cualquier correo." : "You can unsubscribe at any time from the footer of any email."}
          </p>
        </div>
      `;
      await sendEmail(resend, {
        from: "CIAfeeds <hello@ciafeed.com>",
        to: emailRaw,
        subject,
        html,
      });
    } catch (err) {
      console.warn({
        event: "newsletter_welcome_email_failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, subscribed: true });
}

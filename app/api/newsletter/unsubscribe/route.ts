// One-click unsubscribe. Honoured for CAN-SPAM compliance. The token is a
// per-row UUID generated when the row is created; we use a GET link so users
// can click straight from an email client without a JS-driven form (some
// clients block JS, and a working unsubscribe is non-negotiable).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || token.length < 8) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  }

  const sub = await prisma.newsletterSubscriber.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true, locale: true, unsubscribedAt: true },
  });
  if (!sub) {
    return new NextResponse("Subscriber not found.", { status: 404 });
  }

  if (!sub.unsubscribedAt) {
    await prisma.newsletterSubscriber.update({
      where: { id: sub.id },
      data: { unsubscribedAt: new Date() },
    });
  }

  const isEs = sub.locale === "es";
  const html = `<!doctype html>
<html lang="${sub.locale}">
<head>
  <meta charset="utf-8">
  <title>${isEs ? "Suscripción cancelada" : "Unsubscribed"}</title>
  <meta name="robots" content="noindex">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: system-ui, sans-serif; max-width: 560px; margin: 60px auto; padding: 0 20px; color: #0F172A;">
  <h1 style="font-size: 24px;">${isEs ? "Te has dado de baja" : "You're unsubscribed"}</h1>
  <p>${isEs ? "Ya no recibirás más correos de CIAfeeds. Si fue un error, puedes volver a suscribirte en cualquier momento desde el sitio." : "You won't receive any more emails from CIAfeeds. If this was a mistake, you can resubscribe from the site at any time."}</p>
  <p><a href="${isEs ? "https://www.ciafeed.com/es" : "https://www.ciafeed.com"}" style="color: #4338CA;">${isEs ? "Volver a CIAfeeds" : "Back to CIAfeeds"}</a></p>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

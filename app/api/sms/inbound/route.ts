/**
 * Twilio SMS inbound webhook.
 *
 * Twilio POSTs application/x-www-form-urlencoded with these params:
 *   From         — E.164 phone number of the sender
 *   To           — our Twilio number (or one of them, if multi-number)
 *   Body         — the message text
 *   MessageSid   — unique Twilio message ID
 *   (many other fields we ignore)
 *
 * Auth: HMAC-SHA1 signature in X-Twilio-Signature header. Verified via
 * lib/twilio.ts:verifyTwilioSignature. If the signature is missing or
 * invalid we 403; we do NOT echo anything back since the request likely
 * isn't from Twilio.
 *
 * Response: TwiML (XML) — we return `<Response/>` empty because we send
 * outbound messages via the REST API rather than inline TwiML. This lets
 * us defer the actual reply until after we've done the URL scraping,
 * which can take 10-30s and would otherwise time out Twilio's webhook.
 *
 * Inbound-first model: we only ever respond to a number that texts US
 * first. No proactive outbound, so no TCPA opt-in burden. We still honor
 * STOP per carrier rules.
 *
 * Idempotency: Twilio retries failed webhooks. We dedupe on MessageSid
 * via the SmsMessage.twilioMessageSid unique constraint, so retries get
 * a clean 200 without double-processing.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyTwilioSignature,
  sendSms,
  normalizePhoneE164,
} from "@/lib/twilio";
import { classifyIntent, type SmsIntent } from "@/lib/smsIntent";
import {
  parseCommandAuto,
  searchInventory,
  stageCommand,
  executeCommand,
  CONFIRMATION_TTL_MS,
  type PendingCommand,
} from "@/lib/smsCommands";

// Twilio's webhook can take a few seconds to complete; allow up to 30s
// before responding so we have headroom for URL extraction + dispatch.
export const maxDuration = 30;

// ---------------------------------------------------------------------
// Response messages — kept as constants for clarity and easy A/B later.
// ---------------------------------------------------------------------

const REPLIES = {
  optedOut:
    "You're opted out. Reply START to receive messages from CIA Feeds again.",
  optedBackIn:
    "Welcome back. Text me a URL of any listing from your website and I'll add it to your catalog. Reply HELP for more.",
  help:
    "CIA Feeds SMS — what I can do:\n" +
    "• Send a URL to add a listing\n" +
    "• 'delete <name>' to remove\n" +
    "• 'price <name> to <number>' to change price\n" +
    "• 'reset image on <name>'\n" +
    "• 'mark <name> as sold'\n" +
    "• 'publish <name>' or 'unpublish <name>'\n" +
    "• 'WEEKLY' for a weekly metrics digest\n" +
    "• 'ALERTS' for realtime lead/sync alerts\n" +
    "• STOP to opt out",
  unknownDealer:
    "I don't recognize this number. To use SMS, sign in at https://www.ciafeed.com/dashboard and add this number to your profile.",
  uploadQueuedWithVertical: (kind: string) =>
    `Got it. I'm importing this ${kind} into your catalog now — you'll see it in your dashboard within a minute.`,
  uploadFailedInvalidUrl:
    "That doesn't look like a valid URL. Send me a link starting with http:// or https://.",
  uploadFailedNoSubscription:
    "Your subscription is inactive. Activate at https://www.ciafeed.com/billing to enable SMS uploads.",
  questionFallback:
    "I can help with listing uploads, edits, and alerts — reply HELP for a full list of what I do.",
  genericAck:
    "Got it. If you meant to upload a listing, send me a URL. Reply HELP for options.",
  stopAcknowledged:
    "You're opted out. You won't receive any more messages. Reply START to opt back in.",
  optedInWeekly:
    "You're subscribed to the weekly metrics digest. You'll get a summary every Monday morning. Reply STOP anytime.",
  optedInAlerts:
    "You're subscribed to realtime alerts (new leads, catalog sync issues, trial reminders). Reply STOP anytime.",
  commandNotParsed:
    "I couldn't parse that. Try: 'delete F-150', 'price F-150 to 32500', 'reset image on F-150', 'mark F-150 as sold'. Reply HELP for more.",
  itemNotFound: (query: string) =>
    `I couldn't find "${query}" in your inventory. Check the dashboard or try a different name.`,
  ambiguousChoice: (items: { label: string }[]) =>
    "I found multiple matches. Reply with the number:\n" +
    items.map((it, i) => `${i + 1}. ${it.label}`).join("\n"),
  confirmationExpired:
    "That confirmation expired. Just text me the command again if you still want to do it.",
  cancelled: "OK, cancelled.",
  needToConfirm:
    "Reply YES to confirm, NO to cancel.",
} as const;

// ---------------------------------------------------------------------
// TwiML helpers
// ---------------------------------------------------------------------

function twimlResponse(): NextResponse {
  // Empty TwiML — we send replies via REST so this just acks the webhook.
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

// ---------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // Step 1: read raw form body and reconstruct param map for signature
  // verification. We must use the SAME parameter set Twilio signed.
  const formData = await request.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") params[k] = v;
  }

  // Step 2: verify signature. Twilio signs the FULL public URL it called.
  // We reconstruct using x-forwarded headers since Vercel terminates TLS
  // before us. The URL must include the query string if any (we have none).
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const fullUrl = `${proto}://${host}${request.nextUrl.pathname}`;

  const signature = request.headers.get("x-twilio-signature");
  if (!verifyTwilioSignature(fullUrl, params, signature)) {
    console.warn({
      event: "sms_inbound_bad_signature",
      from: params.From,
      hasSignature: !!signature,
    });
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  const from = normalizePhoneE164(params.From);
  const body = (params.Body ?? "").trim();
  const messageSid = params.MessageSid;

  if (!from || !messageSid) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // Step 3: idempotency. If we've already seen this MessageSid, ack and bail.
  const existing = await prisma.smsMessage.findUnique({
    where: { twilioMessageSid: messageSid },
  });
  if (existing) {
    return twimlResponse();
  }

  // Step 4: look up or create the conversation for this phone.
  const dealer = await prisma.dealer.findFirst({
    where: { phone: from, deletedAt: null },
    select: { id: true, vertical: true, slug: true },
  });

  const conversation = await prisma.smsConversation.upsert({
    where: { phoneNumber: from },
    create: {
      phoneNumber: from,
      dealerId: dealer?.id ?? null,
      state: "idle",
      lastInboundAt: new Date(),
    },
    update: {
      dealerId: dealer?.id ?? null,
      lastInboundAt: new Date(),
    },
    select: {
      id: true,
      state: true,
      pendingPayload: true,
      pendingExpiresAt: true,
      optedOutAt: true,
      dealerId: true,
    },
  });

  // Persist the inbound message (also our idempotency record).
  await prisma.smsMessage.create({
    data: {
      conversationId: conversation.id,
      direction: "inbound",
      body,
      twilioMessageSid: messageSid,
      status: "received",
    },
  });

  // Step 5: classify intent. "awaiting confirmation" covers both the
  // old vertical-confirm and the new mutation-confirm flows.
  const awaitingConfirmOrPick =
    conversation.state === "awaiting_vertical_confirm" ||
    conversation.state === "awaiting_confirmation" ||
    conversation.state === "awaiting_pick";
  const intent = await classifyIntent(body, {
    isAwaitingConfirmation: awaitingConfirmOrPick,
  });

  // Step 6: opt-out enforcement. If conversation is opted out, ONLY a
  // START keyword can re-enable outbound. Any other inbound is logged
  // but does not get a reply (carrier-required silence).
  if (conversation.optedOutAt) {
    if (intent.type === "start") {
      await prisma.smsConversation.update({
        where: { id: conversation.id },
        data: { optedOutAt: null, state: "idle" },
      });
      await replyAndLog(conversation.id, from, REPLIES.optedBackIn);
      return twimlResponse();
    }
    // Silent — we cannot send anything else while opted out.
    return twimlResponse();
  }

  // Step 7: route by intent.
  await routeIntent(intent, {
    conversationId: conversation.id,
    phone: from,
    dealer,
    pendingPayload: conversation.pendingPayload as Record<string, unknown> | null,
    pendingExpiresAt: conversation.pendingExpiresAt,
    conversationState: conversation.state,
  });

  return twimlResponse();
}

// ---------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------

interface RouteContext {
  conversationId: string;
  phone: string;
  dealer: { id: string; vertical: string; slug: string } | null;
  pendingPayload: Record<string, unknown> | null;
  pendingExpiresAt: Date | null;
  conversationState: string;
}

async function routeIntent(intent: SmsIntent, ctx: RouteContext): Promise<void> {
  switch (intent.type) {
    case "stop": {
      await prisma.smsConversation.update({
        where: { id: ctx.conversationId },
        data: { optedOutAt: new Date(), state: "paused" },
      });
      // STOP confirmations ARE allowed and required by carriers — one final
      // message acknowledging the opt-out is the documented exception.
      await replyAndLog(ctx.conversationId, ctx.phone, REPLIES.stopAcknowledged);
      return;
    }

    case "start": {
      // Already handled in the opt-out gate above; if we get here, they
      // texted START without being opted out. Treat as a welcome.
      await replyAndLog(ctx.conversationId, ctx.phone, REPLIES.help);
      return;
    }

    case "help": {
      await replyAndLog(ctx.conversationId, ctx.phone, REPLIES.help);
      return;
    }

    case "url_upload": {
      if (!ctx.dealer) {
        await replyAndLog(ctx.conversationId, ctx.phone, REPLIES.unknownDealer);
        return;
      }
      await handleUrlUpload(intent.url, ctx);
      return;
    }

    case "opt_in_weekly": {
      if (!ctx.dealer) {
        await replyAndLog(ctx.conversationId, ctx.phone, REPLIES.unknownDealer);
        return;
      }
      await setProactiveOptIn(ctx.conversationId, { weeklyDigest: true });
      await replyAndLog(ctx.conversationId, ctx.phone, REPLIES.optedInWeekly);
      return;
    }

    case "opt_in_alerts": {
      if (!ctx.dealer) {
        await replyAndLog(ctx.conversationId, ctx.phone, REPLIES.unknownDealer);
        return;
      }
      await setProactiveOptIn(ctx.conversationId, {
        leadAlerts: true,
        syncAlerts: true,
        trialAlerts: true,
      });
      await replyAndLog(ctx.conversationId, ctx.phone, REPLIES.optedInAlerts);
      return;
    }

    case "confirmation": {
      await handleConfirmation(intent.affirmative, ctx);
      return;
    }

    case "pick": {
      await handlePick(intent.index, ctx);
      return;
    }

    case "command": {
      if (!ctx.dealer) {
        await replyAndLog(ctx.conversationId, ctx.phone, REPLIES.unknownDealer);
        return;
      }
      await handleCommand(intent.raw, ctx);
      return;
    }

    case "question":
    case "unknown": {
      await replyAndLog(
        ctx.conversationId,
        ctx.phone,
        intent.type === "question"
          ? REPLIES.questionFallback
          : REPLIES.genericAck
      );
      return;
    }
  }
}

// ---------------------------------------------------------------------
// Mutation command handling (Bucket A)
// ---------------------------------------------------------------------

async function handleCommand(raw: string, ctx: RouteContext): Promise<void> {
  if (!ctx.dealer) return;

  const parsed = await parseCommandAuto(raw);
  if (!parsed) {
    await replyAndLog(ctx.conversationId, ctx.phone, REPLIES.commandNotParsed);
    return;
  }

  const matches = await searchInventory(
    ctx.dealer.id,
    ctx.dealer.vertical,
    parsed.query,
    5
  );

  if (matches.length === 0) {
    await replyAndLog(
      ctx.conversationId,
      ctx.phone,
      REPLIES.itemNotFound(parsed.query)
    );
    return;
  }

  if (matches.length === 1) {
    const target = matches[0];
    const pending: PendingCommand = {
      kind: parsed.kind,
      targetType: target.type,
      targetId: target.id,
      targetLabel: target.label,
      value: parsed.value,
    };
    const staged = stageCommand(pending);
    await persistConversationState(ctx.conversationId, staged);
    await replyAndLog(ctx.conversationId, ctx.phone, staged.reply);
    return;
  }

  // Multiple matches — ask the dealer to pick.
  await prisma.smsConversation.update({
    where: { id: ctx.conversationId },
    data: {
      state: "awaiting_pick",
      pendingPayload: {
        kind: parsed.kind,
        value: parsed.value,
        candidates: matches.map((m) => ({
          type: m.type,
          id: m.id,
          label: m.label,
        })),
      },
      pendingExpiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS),
    },
  });
  await replyAndLog(
    ctx.conversationId,
    ctx.phone,
    REPLIES.ambiguousChoice(matches)
  );
}

async function handleConfirmation(
  affirmative: boolean,
  ctx: RouteContext
): Promise<void> {
  // Only valid in awaiting_confirmation state.
  if (ctx.conversationState !== "awaiting_confirmation") {
    await replyAndLog(ctx.conversationId, ctx.phone, REPLIES.genericAck);
    return;
  }

  if (!affirmative) {
    await clearPendingState(ctx.conversationId);
    await replyAndLog(ctx.conversationId, ctx.phone, REPLIES.cancelled);
    return;
  }

  // Expiry check.
  if (ctx.pendingExpiresAt && ctx.pendingExpiresAt.getTime() < Date.now()) {
    await clearPendingState(ctx.conversationId);
    await replyAndLog(
      ctx.conversationId,
      ctx.phone,
      REPLIES.confirmationExpired
    );
    return;
  }

  const pending = ctx.pendingPayload as unknown as PendingCommand | null;
  if (!pending || !pending.kind || !pending.targetId || !ctx.dealer) {
    await clearPendingState(ctx.conversationId);
    await replyAndLog(ctx.conversationId, ctx.phone, REPLIES.genericAck);
    return;
  }

  const reply = await executeCommand(pending, ctx.dealer.id);
  await clearPendingState(ctx.conversationId);
  await replyAndLog(ctx.conversationId, ctx.phone, reply);
}

async function handlePick(index: number, ctx: RouteContext): Promise<void> {
  if (ctx.conversationState !== "awaiting_pick") {
    await replyAndLog(ctx.conversationId, ctx.phone, REPLIES.genericAck);
    return;
  }

  const payload = ctx.pendingPayload as {
    kind?: string;
    value?: string | number;
    candidates?: Array<{ type: "vehicle" | "listing"; id: string; label: string }>;
  } | null;

  if (!payload?.candidates || !payload.kind || !ctx.dealer) {
    await clearPendingState(ctx.conversationId);
    await replyAndLog(ctx.conversationId, ctx.phone, REPLIES.genericAck);
    return;
  }

  const picked = payload.candidates[index - 1];
  if (!picked) {
    await replyAndLog(
      ctx.conversationId,
      ctx.phone,
      `That number isn't on the list. Reply 1-${payload.candidates.length} or 'cancel'.`
    );
    return;
  }

  const pending: PendingCommand = {
    kind: payload.kind as PendingCommand["kind"],
    targetType: picked.type,
    targetId: picked.id,
    targetLabel: picked.label,
    value: payload.value,
  };
  const staged = stageCommand(pending);
  await persistConversationState(ctx.conversationId, staged);
  await replyAndLog(ctx.conversationId, ctx.phone, staged.reply);
}

async function setProactiveOptIn(
  conversationId: string,
  prefs: { weeklyDigest?: boolean; leadAlerts?: boolean; syncAlerts?: boolean; trialAlerts?: boolean }
): Promise<void> {
  // Merge with any existing prefs (don't clobber).
  const existing = await prisma.smsConversation.findUnique({
    where: { id: conversationId },
    select: { notificationPrefs: true },
  });
  const merged = {
    ...((existing?.notificationPrefs as Record<string, unknown>) ?? {}),
    ...prefs,
  };
  await prisma.smsConversation.update({
    where: { id: conversationId },
    data: {
      optedInProactiveAt: new Date(),
      notificationPrefs: merged,
    },
  });
}

async function persistConversationState(
  conversationId: string,
  staged: { state?: string; pendingPayload?: Record<string, unknown> | null; pendingExpiresAt?: Date | null }
): Promise<void> {
  await prisma.smsConversation.update({
    where: { id: conversationId },
    data: {
      state: staged.state ?? "idle",
      pendingPayload: (staged.pendingPayload as never) ?? null,
      pendingExpiresAt: staged.pendingExpiresAt ?? null,
    },
  });
}

async function clearPendingState(conversationId: string): Promise<void> {
  await prisma.smsConversation.update({
    where: { id: conversationId },
    data: { state: "idle", pendingPayload: undefined, pendingExpiresAt: null },
  });
}

// ---------------------------------------------------------------------
// URL upload handling
// ---------------------------------------------------------------------

async function handleUrlUpload(url: string, ctx: RouteContext): Promise<void> {
  if (!ctx.dealer) return; // unreachable; guarded by caller

  // Validate URL shape (the regex extractor catches obvious bad input, but
  // a "ttp://" or other malformed remainder slips through). Reject early.
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("bad_proto");
    }
  } catch {
    await replyAndLog(ctx.conversationId, ctx.phone, REPLIES.uploadFailedInvalidUrl);
    return;
  }

  // Subscription gate — same rule as the web URL importer.
  const { checkSubscription } = await import("@/lib/checkSubscription");
  const isSubscribed = await checkSubscription(ctx.dealer.id);
  if (!isSubscribed) {
    await replyAndLog(
      ctx.conversationId,
      ctx.phone,
      REPLIES.uploadFailedNoSubscription
    );
    return;
  }

  // Branch by vertical: automotive uses the Vehicle table + scrapeVehicleUrl;
  // services/realestate/ecommerce use the Listing table + the inline scrape
  // route. We replicate the minimal write-stub-and-dispatch pattern from
  // /api/listings/from-url and /api/vehicles/from-url.

  if (ctx.dealer.vertical === "automotive") {
    await dispatchVehicleUpload(parsed.toString(), ctx);
  } else {
    await dispatchListingUpload(parsed.toString(), ctx);
  }
}

async function dispatchVehicleUpload(url: string, ctx: RouteContext): Promise<void> {
  if (!ctx.dealer) return;

  // Stub vehicle with pending status.
  await prisma.vehicle.upsert({
    where: { dealerId_url: { dealerId: ctx.dealer.id, url } },
    create: {
      url,
      dealerId: ctx.dealer.id,
      scrapeStatus: "pending",
      missingFields: [],
      isComplete: false,
    },
    update: { scrapeStatus: "pending", missingFields: [], isComplete: false },
  });

  // Look up the vehicleId from the upsert (we didn't capture the return).
  const stub = await prisma.vehicle.findUnique({
    where: { dealerId_url: { dealerId: ctx.dealer.id, url } },
    select: { id: true },
  });

  if (stub) {
    // Fire-and-forget dispatch to the existing /api/vehicles/scrape route,
    // authenticated via SYNC_SECRET (same pattern as /api/vehicles/from-url).
    // This avoids duplicating the ~50-line scrape -> DB write logic.
    void dispatchScrapeRequest(
      "vehicles",
      { vehicleId: stub.id, url, dealerId: ctx.dealer.id },
      ctx
    );
  }

  await replyAndLog(
    ctx.conversationId,
    ctx.phone,
    REPLIES.uploadQueuedWithVertical("vehicle")
  );
}

/**
 * Fire-and-forget POST to the internal scrape route. Uses SYNC_SECRET so
 * the scrape route accepts the request without a session (same pattern
 * as /api/vehicles/from-url and /api/listings/from-url).
 *
 * Returns void; errors are logged but don't fail the SMS response — the
 * dealer has already been told 'importing now', so any failure here
 * shows up in the dealer's dashboard as a failed listing.
 */
function dispatchScrapeRequest(
  kind: "vehicles" | "listings",
  payload: Record<string, unknown>,
  ctx: RouteContext
): Promise<void> {
  const syncSecret = process.env.SYNC_SECRET;
  if (!syncSecret) {
    console.warn({
      event: "sms_scrape_dispatch_missing_secret",
      kind,
      dealerId: ctx.dealer?.id,
    });
    return Promise.resolve();
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.ciafeed.com";

  return fetch(`${appUrl}/api/${kind}/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sync-secret": syncSecret,
    },
    body: JSON.stringify(payload),
  })
    .then(() => {})
    .catch((err) => {
      console.error({
        event: "sms_scrape_dispatch_error",
        kind,
        dealerId: ctx.dealer?.id,
        message: err instanceof Error ? err.message : String(err),
      });
    });
}

async function dispatchListingUpload(url: string, ctx: RouteContext): Promise<void> {
  if (!ctx.dealer) return;

  // Stub listing row.
  const listing = await prisma.listing.create({
    data: {
      dealerId: ctx.dealer.id,
      vertical: ctx.dealer.vertical,
      title: url,
      url,
      isComplete: false,
      missingFields: [],
      data: { scrapeStatus: "pending", url, source: "sms" },
    },
  });

  // Fire-and-forget the scrape work via the existing scrape route.
  void dispatchScrapeRequest(
    "listings",
    {
      listingId: listing.id,
      url,
      dealerId: ctx.dealer.id,
      vertical: ctx.dealer.vertical,
      dealerName: undefined,
      dealerAddress: undefined,
    },
    ctx
  );

  const kind =
    ctx.dealer.vertical === "realestate"
      ? "listing"
      : ctx.dealer.vertical === "ecommerce"
      ? "product"
      : "service";

  await replyAndLog(
    ctx.conversationId,
    ctx.phone,
    REPLIES.uploadQueuedWithVertical(kind)
  );
}



// ---------------------------------------------------------------------
// Outbound send helper (logs message to DB regardless of send outcome)
// ---------------------------------------------------------------------

async function replyAndLog(
  conversationId: string,
  to: string,
  body: string
): Promise<void> {
  // Always log the attempt first; if Twilio fails we still have a trail.
  const msg = await prisma.smsMessage.create({
    data: {
      conversationId,
      direction: "outbound",
      body,
      status: "queued",
    },
  });

  const result = await sendSms({ to, body });

  await prisma.smsMessage.update({
    where: { id: msg.id },
    data: {
      twilioMessageSid: result.sid ?? null,
      status: result.ok ? "sent" : "failed",
      errorMessage: result.error ?? null,
    },
  });

  if (result.ok) {
    await prisma.smsConversation.update({
      where: { id: conversationId },
      data: { lastOutboundAt: new Date() },
    });
  } else {
    console.warn({
      event: "sms_outbound_failed",
      conversationId,
      error: result.error,
    });
  }
}

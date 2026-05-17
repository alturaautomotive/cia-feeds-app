/**
 * Twilio client + webhook helpers.
 *
 * We deliberately avoid the `twilio` npm SDK to keep the bundle small.
 * Everything we need (REST send + webhook signature verification) is a
 * thin wrapper around fetch + Node's crypto module.
 *
 * Required env vars (production):
 *   TWILIO_ACCOUNT_SID         e.g. ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   TWILIO_AUTH_TOKEN          (used for both REST auth + webhook signature)
 *   TWILIO_MESSAGING_SERVICE_SID OR TWILIO_PHONE_NUMBER
 *
 * Webhook auth flow:
 *   1. Twilio signs every webhook POST with the `X-Twilio-Signature` header.
 *   2. The signature is HMAC-SHA1(base64) of the full URL plus the
 *      sorted concatenation of every POST parameter (key + value).
 *   3. Computed using your auth token as the key.
 *   4. Documented at https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * Why not the SDK's RequestValidator: depending on the SDK pulls in a
 * 4 MB dependency tree just to wrap this 10-line function.
 */
import { createHmac } from "crypto";
import { withBreaker, CircuitOpenError } from "@/lib/circuitBreaker";

const TWILIO_REST_BASE = "https://api.twilio.com/2010-04-01";

export class TwilioConfigError extends Error {
  constructor(missing: string) {
    super(`Twilio not configured: missing ${missing}`);
    this.name = "TwilioConfigError";
  }
}

function getAccountSid(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  if (!sid) throw new TwilioConfigError("TWILIO_ACCOUNT_SID");
  return sid;
}

function getAuthToken(): string {
  const t = process.env.TWILIO_AUTH_TOKEN;
  if (!t) throw new TwilioConfigError("TWILIO_AUTH_TOKEN");
  return t;
}

function getSender(): { messagingServiceSid?: string; from?: string } {
  const msid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (msid) return { messagingServiceSid: msid };
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (from) return { from };
  throw new TwilioConfigError("TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER");
}

/**
 * Verify a Twilio webhook signature.
 *
 * Per Twilio docs, the signature is computed over:
 *   url + sorted_concatenation_of_post_params
 *
 * The URL must be the FULL URL Twilio called, including any query string.
 * If the request is behind a reverse proxy that rewrites the host, the
 * caller must reconstruct the original URL from x-forwarded-* headers.
 *
 * Returns true if the signature matches.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signatureHeader: string | null | undefined,
  authToken?: string
): boolean {
  if (!signatureHeader) return false;
  const token = authToken ?? process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;

  // Sort keys and concatenate key + value pairs.
  const sortedKeys = Object.keys(params).sort();
  const data = url + sortedKeys.map((k) => k + params[k]).join("");

  const computed = createHmac("sha1", token).update(data).digest("base64");

  // Timing-safe compare (both strings are base64 + same length when valid).
  if (computed.length !== signatureHeader.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return mismatch === 0;
}

export interface SendSmsOptions {
  to: string; // E.164
  body: string;
}

export interface SendSmsResult {
  ok: boolean;
  sid?: string;
  status?: string;
  error?: string;
}

/**
 * Send an outbound SMS via Twilio REST API. Wrapped in our circuit breaker
 * so a Twilio outage fails fast instead of holding Vercel function exec.
 *
 * Twilio API auth: Basic <base64(SID:AUTH_TOKEN)>.
 * Body params: x-www-form-urlencoded.
 *
 * On success: returns `{ ok: true, sid, status }`.
 * On Twilio API error: returns `{ ok: false, error }`.
 * On breaker-open: returns `{ ok: false, error: "breaker_open" }`.
 */
export async function sendSms(opts: SendSmsOptions): Promise<SendSmsResult> {
  let sid: string;
  let authToken: string;
  let sender: { messagingServiceSid?: string; from?: string };
  try {
    sid = getAccountSid();
    authToken = getAuthToken();
    sender = getSender();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "config_error" };
  }

  const params = new URLSearchParams();
  params.set("To", opts.to);
  params.set("Body", opts.body);
  if (sender.messagingServiceSid) {
    params.set("MessagingServiceSid", sender.messagingServiceSid);
  } else if (sender.from) {
    params.set("From", sender.from);
  }

  const url = `${TWILIO_REST_BASE}/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${authToken}`).toString("base64");

  try {
    const res = await withBreaker(
      "twilio.sendSms",
      async () => {
        const r = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        });
        return r;
      },
      { timeoutMs: 10_000 }
    );

    const body = (await res.json()) as {
      sid?: string;
      status?: string;
      code?: number;
      message?: string;
    };

    if (!res.ok) {
      return {
        ok: false,
        error: body.message ?? `twilio_http_${res.status}`,
      };
    }
    return { ok: true, sid: body.sid, status: body.status };
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return { ok: false, error: "breaker_open" };
    }
    return { ok: false, error: err instanceof Error ? err.message : "send_failed" };
  }
}

/**
 * Normalize a phone number to E.164 ("+15555550100").
 *
 * Acceptable inputs:
 *   - "+15555550100"  -> unchanged
 *   - "15555550100"   -> "+15555550100"
 *   - "5555550100"    -> "+15555550100" (US default)
 *   - "(555) 555-0100" -> "+15555550100"
 *   - "555-555-0100"  -> "+15555550100"
 *
 * Returns null if the input can't be reasonably normalized.
 */
export function normalizePhoneE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Strip every non-digit except a leading +
  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) return null;

  // International with country code
  if (hasLeadingPlus) {
    return digits.length >= 7 ? `+${digits}` : null;
  }

  // Default to US (+1) for 10-digit input
  if (digits.length === 10) return `+1${digits}`;

  // Already 11 digits starting with 1 (US/Canada NANP)
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  // Any other length is ambiguous - reject rather than guess
  return null;
}

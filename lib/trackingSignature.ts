import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * HMAC signature for the /api/track Conversions API proxy
 * (SECURITY_AUDIT.md F-2.6).
 *
 * Problem: /api/track is necessarily public (it's called from the dealer's
 * website to record visitor events to Meta's Conversions API). Without a
 * signature, anyone who knows the dealer's pixelId can spam events against
 * the dealer's CAPI quota or pollute their attribution data.
 *
 * Solution: each dealer has a `trackingSecret` (32-byte random, base64). The
 * widget signs each tracking request by HMAC-SHA256-ing the request body
 * with the secret, and sends the digest as `X-CIA-Signature: sha256=<hex>`.
 * The server recomputes the HMAC and compares timing-safely.
 *
 * Rollout: during the grace period the route accepts unsigned requests but
 * logs an `unsigned_track` event. After dealers update their embed snippet
 * (the dashboard exposes the secret), we flip TRACK_REQUIRE_SIGNATURE=true
 * and unsigned requests start rejecting.
 */

const HEADER = "x-cia-signature";

export function generateTrackingSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function signTrackingBody(rawBody: string, secret: string): string {
  const mac = createHmac("sha256", secret).update(rawBody).digest("hex");
  return `sha256=${mac}`;
}

/**
 * Verify a tracking request signature.
 *
 * @param rawBody  The exact bytes the server received (NOT re-stringified).
 * @param header   The X-CIA-Signature header value.
 * @param secret   The dealer's trackingSecret from the DB.
 * @returns        true iff the header matches a sha256 HMAC of rawBody under secret.
 */
export function verifyTrackingSignature(
  rawBody: string,
  header: string | null,
  secret: string | null
): boolean {
  if (!header || !secret) return false;
  if (!header.startsWith("sha256=")) return false;
  const expected = signTrackingBody(rawBody, secret);
  // timingSafeEqual requires same-length buffers.
  if (expected.length !== header.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(header));
  } catch {
    return false;
  }
}

export const TRACKING_SIGNATURE_HEADER = HEADER;

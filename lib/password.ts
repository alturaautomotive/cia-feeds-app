/**
 * Password hashing + breach checking for CIA Feeds.
 *
 * Decisions documented for compliance/audit (SECURITY_AUDIT.md F-1.5):
 *
 *   - Bcrypt cost factor: 12. OWASP minimum for bcrypt as of 2024.
 *     Cost-10 (previous) is ~100ms; cost-12 is ~400ms on modern hardware,
 *     still well below the 1-second user-perceptible threshold. Backward-
 *     compatible: old cost-10 hashes still verify with `bcrypt.compare`.
 *
 *   - Minimum length: 10 characters. NIST SP 800-63B requires \u22658.
 *     We pick 10 as a defensible "exceeds the minimum" number that doesn't
 *     hurt UX. No mandatory complexity rules (special chars, mix of case) \u2014
 *     SP 800-63B explicitly recommends against them because they reduce
 *     usable entropy more than they add it.
 *
 *   - Breach check via Have I Been Pwned k-anonymity API. Free, privacy-
 *     preserving (only the first 5 chars of the SHA-1 hash are sent), and
 *     blocks the top ~850M known-leaked passwords. Failure-mode: if HIBP
 *     is unreachable, we *allow* the password. Refusing on HIBP outage
 *     would deny legitimate signups during a third-party incident, which
 *     is a worse failure mode than letting one weak password through.
 */
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";

export const BCRYPT_COST = 12;
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

const HIBP_TIMEOUT_MS = 2000;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * Verifies a password against a bcrypt hash. Works with any cost factor
 * (i.e. legacy cost-10 hashes continue to verify).
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface PasswordStrengthResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validates a password against our policy + HIBP breach corpus.
 *
 * Returns `{ ok: false, reason: "..." }` for any rejection. Callers should
 * surface the reason verbatim in 400 responses; the strings are stable.
 */
export async function validatePasswordStrength(
  plain: string
): Promise<PasswordStrengthResult> {
  if (typeof plain !== "string") return { ok: false, reason: "password_required" };
  if (plain.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (plain.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, reason: `password must be ${MAX_PASSWORD_LENGTH} characters or fewer` };
  }

  // Reject obvious sentinel values that bypass length checks.
  const lowered = plain.toLowerCase();
  if (
    lowered === "password" ||
    lowered === "qwertyuiop" ||
    /^(.)\1{4,}$/.test(plain) // five+ repeated chars in a row
  ) {
    return { ok: false, reason: "password is too common" };
  }

  // HIBP k-anonymity check: send only the first 5 hex chars of SHA-1.
  const sha1 = createHash("sha1").update(plain).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "User-Agent": "cia-feeds-app/1.0" },
      signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Fail open \u2014 a flaky HIBP endpoint shouldn't block signups.
      return { ok: true };
    }
    const text = await res.text();
    // Each line looks like "<35-char-sha1-suffix>:<count>".
    for (const line of text.split(/\r?\n/)) {
      const [hashSuffix, countStr] = line.split(":");
      if (hashSuffix && hashSuffix.toUpperCase() === suffix) {
        const count = Number(countStr ?? "0");
        // Reject if seen in *any* known breach. The HIBP corpus only
        // contains passwords from real breaches \u2014 there are no false
        // positives.
        if (count > 0) {
          return {
            ok: false,
            reason:
              "password has appeared in a known data breach. Please choose a different one.",
          };
        }
      }
    }
    return { ok: true };
  } catch {
    // Network/timeout \u2014 fail open.
    return { ok: true };
  }
}

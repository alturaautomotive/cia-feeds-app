/**
 * Application-layer encryption for Lead PII (SECURITY_AUDIT.md F-8.4 / #29).
 *
 * Why app-layer when Postgres is encrypted at rest?
 *   At-rest encryption protects against stolen disks, not against
 *   compromised application credentials or a leaked database password.
 *   Encrypting name / email / phone at the row level means even a full
 *   table dump (e.g. via a leaked DATABASE_URL like the one we rotated
 *   on May 12) doesn't yield plaintext PII.
 *
 * Format:
 *   Stored values are hex strings produced by lib/crypto.ts encrypt()
 *   prefixed with "enc:v1:" so we can:
 *     - Detect ciphertext vs. legacy plaintext (no prefix = legacy).
 *     - Rotate the encryption scheme later (enc:v2:...).
 *
 * Performance:
 *   Lead writes happen at human submit cadence (single inserts), so
 *   per-row AES-GCM cost is irrelevant. Reads only happen during GDPR
 *   data exports and admin views (rare).
 */
import { encrypt, decrypt } from "@/lib/crypto";

const CIPHERTEXT_PREFIX = "enc:v1:";

export function encryptLeadField(plaintext: string): string {
  return CIPHERTEXT_PREFIX + encrypt(plaintext);
}

export function encryptLeadFieldNullable(
  plaintext: string | null | undefined
): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === "") {
    return null;
  }
  return encryptLeadField(plaintext);
}

/**
 * Decrypt a Lead PII field. If the stored value lacks the "enc:v1:"
 * prefix we treat it as legacy plaintext (no decryption). This gives us
 * forward compatibility with any imported leads that bypass the create
 * path, without crashing the export.
 *
 * On corrupted ciphertext (key rotated, byte garbled) we return a
 * sentinel rather than throwing, so a single bad row doesn't break the
 * whole GDPR export. The sentinel is intentionally obvious so operators
 * notice.
 */
export function decryptLeadField(stored: string): string {
  if (!stored.startsWith(CIPHERTEXT_PREFIX)) {
    return stored; // legacy plaintext
  }
  try {
    return decrypt(stored.slice(CIPHERTEXT_PREFIX.length));
  } catch (err) {
    console.error({
      event: "lead_decrypt_failed",
      message: err instanceof Error ? err.message : String(err),
    });
    return "[decryption_failed]";
  }
}

export function decryptLeadFieldNullable(
  stored: string | null | undefined
): string | null {
  if (stored === null || stored === undefined) return null;
  return decryptLeadField(stored);
}

/**
 * Decrypt every PII field on a Lead row in place. Use this when reading
 * Leads back for display, GDPR export, or admin tooling.
 */
export interface EncryptedLeadRow {
  name: string;
  email: string | null;
  phone: string | null;
  [key: string]: unknown;
}

export function decryptLeadRow<T extends EncryptedLeadRow>(row: T): T {
  return {
    ...row,
    name: decryptLeadField(row.name),
    email: decryptLeadFieldNullable(row.email),
    phone: decryptLeadFieldNullable(row.phone),
  };
}

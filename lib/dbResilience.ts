/**
 * Database resilience helpers (SECURITY_AUDIT.md F-7.7).
 *
 * Provides:
 *   - withDbRetry(): short retry loop for transient Postgres errors
 *     (connection drops, statement_timeout, "database is starting up").
 *     Default: 2 retries with 100ms, 300ms backoff.
 *   - isTransientDbError(): predicate that distinguishes "the DB blipped"
 *     from "the data is wrong" - we should only retry the former.
 *   - dbUnavailableResponse(): unified 503 with Retry-After:30 for read
 *     paths that can't degrade further, so the client backs off instead
 *     of hammering us.
 *
 * Why not a full cache: most of our public read paths (feeds, storefronts)
 * stream large CSV/HTML responses where caching is non-trivial. Adding
 * retries + clean 503s catches the 95% case (a brief Supabase reconnect)
 * without introducing a new caching layer to maintain.
 */
import { NextResponse } from "next/server";

/**
 * Best-effort detection of transient Postgres failures we should retry.
 *
 * Prisma surfaces these as `PrismaClientKnownRequestError` with codes:
 *   P1001 - cant reach DB server
 *   P1002 - DB connection timed out
 *   P1008 - operation timed out
 *   P1017 - DB server closed the connection
 *   P2024 - connection pool exhausted
 *
 * Or as `PrismaClientInitializationError` (DB not ready yet).
 *
 * Other errors (e.g. P2025 record not found) are NOT retried.
 */
export function isTransientDbError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; name?: string; message?: string };
  if (e.code && ["P1001", "P1002", "P1008", "P1017", "P2024"].includes(e.code)) {
    return true;
  }
  if (e.name === "PrismaClientInitializationError") return true;
  if (e.name === "PrismaClientRustPanicError") return true;
  // Fallback: well-known transient messages from the pg driver.
  const msg = (e.message ?? "").toLowerCase();
  if (
    msg.includes("connection terminated") ||
    msg.includes("connection refused") ||
    msg.includes("server closed the connection") ||
    msg.includes("the database system is starting up")
  ) {
    return true;
  }
  return false;
}

export interface WithDbRetryOptions {
  /** Number of retry attempts after the first try. Default 2. */
  retries?: number;
  /** Base delay in ms; doubles each retry. Default 100. */
  baseDelayMs?: number;
  /** Optional label for logging. */
  label?: string;
}

/**
 * Run a DB query with short retry on transient errors. The wrapped fn must
 * be idempotent (we only retry on errors, never on successful side effects).
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  opts: WithDbRetryOptions = {}
): Promise<T> {
  const { retries = 2, baseDelayMs = 100, label = "db" } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientDbError(err) || attempt === retries) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn({
        event: "db_retry",
        label,
        attempt: attempt + 1,
        delayMs: delay,
        message: err instanceof Error ? err.message : String(err),
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Standard 503 response for unrecoverable DB errors on public read paths.
 * Includes Retry-After: 30 so well-behaved clients (Meta crawler, Googlebot,
 * dealer monitoring) back off instead of retrying immediately.
 */
export function dbUnavailableResponse(label = "db"): NextResponse {
  console.error({ event: "db_unavailable", label });
  return new NextResponse(
    JSON.stringify({ error: "database_unavailable", retry: true }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "30",
        "Cache-Control": "no-store",
      },
    }
  );
}

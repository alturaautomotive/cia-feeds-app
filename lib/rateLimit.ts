// NOTE: This in-memory rate limiter resets on every cold start in serverless
// environments like Vercel. For production use, replace with an edge-compatible
// store such as Upstash Redis (@upstash/ratelimit) or use Vercel's built-in
// WAF rate limiting if available on your plan. Consider using Vercel
// x-middleware- headers for basic throttling in middleware.ts as an interim measure.

const store = new Map<string, { count: number; resetAt: number }>();

/** Legacy in-memory rate limiter (kept for non-critical routes). */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count += 1;
  }

  const current = store.get(key)!;
  return {
    allowed: current.count <= limit,
    retryAfterMs: Math.max(0, current.resetAt - Date.now()),
  };
}

import { prisma } from "@/lib/prisma";

/**
 * Durable DB-backed rate limiter with atomic increment semantics.
 * Falls back to the in-memory limiter if the DB call fails so that
 * a transient DB issue doesn't knock out the endpoint entirely.
 */
export async function durableRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  try {
    const now = Date.now();
    const windowStart = new Date(now - (now % windowMs));
    const expiresAt = new Date(windowStart.getTime() + windowMs * 2);

    const bucket = await prisma.rateLimitBucket.upsert({
      where: {
        key_windowStart: { key, windowStart },
      },
      create: {
        key,
        windowStart,
        windowMs,
        count: 1,
        expiresAt,
      },
      update: {
        count: { increment: 1 },
      },
    });

    const retryAfterMs = Math.max(0, windowStart.getTime() + windowMs - Date.now());

    return {
      allowed: bucket.count <= limit,
      retryAfterMs,
    };
  } catch (err) {
    console.error("[durableRateLimit] DB fallback to in-memory:", err);
    return rateLimit(key, limit, windowMs);
  }
}

/** Clean up expired buckets (call periodically or via cron). */
export async function cleanupExpiredBuckets(): Promise<number> {
  const result = await prisma.rateLimitBucket.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

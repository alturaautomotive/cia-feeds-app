// NOTE: This in-memory rate limiter resets on every cold start in serverless
// environments like Vercel. For production use, replace with an edge-compatible
// store such as Upstash Redis (@upstash/ratelimit) or use Vercel's built-in
// WAF rate limiting if available on your plan. Consider using Vercel
// x-middleware- headers for basic throttling in middleware.ts as an interim measure.

const store = new Map<string, { count: number; resetAt: number }>();

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

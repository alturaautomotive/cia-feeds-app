/**
 * Lightweight in-process circuit breaker (SECURITY_AUDIT.md F-7.5).
 *
 * Why home-grown instead of `opossum`: we run in Vercel serverless lambdas
 * where each cold start is a fresh process; long-lived `opossum` event
 * emitters and timers don't fit. State is per-lambda-instance, which is
 * appropriate: if instance A trips a breaker, instance B can still try
 * independently, giving us a self-healing "is the upstream actually down
 * or was it just my lambda?" check for free.
 *
 * Three states (Martin Fowler's canonical model):
 *
 *    CLOSED      - calls pass through. Failures counted.
 *    OPEN        - calls fail-fast with CircuitOpenError.
 *                  After cooldownMs, transitions to HALF_OPEN.
 *    HALF_OPEN   - one trial call permitted. Success -> CLOSED.
 *                  Failure -> OPEN again (with the cooldown reset).
 *
 * Failure thresholds default to 5 consecutive errors -> open for 30 seconds.
 * Network/timeout/5xx HTTP all count as failures; 4xx do NOT (those are
 * legitimate "your request was bad" responses).
 *
 * Used by lib/firecrawl wrappers, OpenAI/Gemini clients, Resend, and any
 * other external client we want to insulate from.
 */

export class CircuitOpenError extends Error {
  constructor(public readonly name_: string) {
    super(`circuit_open: ${name_}`);
    this.name = "CircuitOpenError";
  }
}

type State = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  /** Consecutive failures before opening. Default 5. */
  failureThreshold?: number;
  /** Cool-down before half-open trial. Default 30s. */
  cooldownMs?: number;
  /** Wall-clock timeout for the wrapped call. Default 15s. */
  timeoutMs?: number;
  /**
   * Predicate that decides whether a thrown error counts as a failure.
   * Default: any thrown error counts.
   */
  isFailure?: (err: unknown) => boolean;
}

interface BreakerState {
  state: State;
  failures: number;
  openedAt: number; // epoch ms; 0 when closed
}

const breakers = new Map<string, BreakerState>();

function getState(name: string): BreakerState {
  let s = breakers.get(name);
  if (!s) {
    s = { state: "closed", failures: 0, openedAt: 0 };
    breakers.set(name, s);
  }
  return s;
}

/**
 * Run `fn` through the named circuit breaker.
 *
 * Throws `CircuitOpenError` immediately when the breaker is open (without
 * invoking `fn`). Otherwise invokes `fn`, with a wall-clock timeout, and
 * updates the breaker based on success/failure.
 */
export async function withBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  opts: CircuitBreakerOptions = {}
): Promise<T> {
  const {
    failureThreshold = 5,
    cooldownMs = 30_000,
    timeoutMs = 15_000,
    isFailure = () => true,
  } = opts;

  const s = getState(name);
  const now = Date.now();

  // Transition OPEN -> HALF_OPEN after cooldown.
  if (s.state === "open" && now - s.openedAt >= cooldownMs) {
    s.state = "half_open";
  }

  if (s.state === "open") {
    throw new CircuitOpenError(name);
  }

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout: ${name} >${timeoutMs}ms`)), timeoutMs);
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    // Success path - close the breaker.
    s.state = "closed";
    s.failures = 0;
    s.openedAt = 0;
    return result;
  } catch (err) {
    if (!isFailure(err)) {
      // Doesn't count - leave breaker state alone.
      throw err;
    }
    s.failures += 1;
    if (s.state === "half_open" || s.failures >= failureThreshold) {
      s.state = "open";
      s.openedAt = now;
      console.warn({
        event: "circuit_breaker_opened",
        circuit: name,
        failures: s.failures,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Inspect the current state of a circuit (for /admin/health dashboards).
 */
export function inspectBreaker(name: string): Readonly<BreakerState> {
  return { ...getState(name) };
}

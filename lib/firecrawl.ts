import "@/lib/env";
import FirecrawlApp from "@mendable/firecrawl-js";
import { withBreaker } from "@/lib/circuitBreaker";

/**
 * Firecrawl client wrapped in a circuit breaker (SECURITY_AUDIT.md F-7.5).
 *
 * Firecrawl is on the hot path for every crawl/scrape; when their API is
 * slow or down, we used to retry-on-throw with no upper bound, holding open
 * Vercel function executions for the full 300s maxDuration. With a breaker,
 * after 5 consecutive failures we fail-fast for 30 seconds and return a
 * graceful "service degraded" instead of stacking up requests behind a
 * dead dependency.
 *
 * Public API: same as `FirecrawlApp` for the methods we use. Add wrappers
 * here as needed.
 */
const rawClient = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_API_KEY ?? "",
});

export const firecrawlClient = {
  // Keep the raw instance accessible for unusual callers (validate-url etc.).
  _raw: rawClient,

  async scrape(...args: Parameters<typeof rawClient.scrape>) {
    return withBreaker("firecrawl.scrape", () => rawClient.scrape(...args), {
      timeoutMs: 60_000, // Firecrawl scrapes can legitimately take a while
    });
  },

  async crawl(...args: Parameters<typeof rawClient.crawl>) {
    return withBreaker("firecrawl.crawl", () => rawClient.crawl(...args), {
      timeoutMs: 120_000,
    });
  },

  async map(...args: Parameters<typeof rawClient.map>) {
    return withBreaker("firecrawl.map", () => rawClient.map(...args), {
      timeoutMs: 60_000,
    });
  },
};

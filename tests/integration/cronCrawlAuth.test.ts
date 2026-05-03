import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.CRON_SECRET = "test-cron-secret";
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealer: { findMany: vi.fn() },
    crawlJob: { count: vi.fn(), create: vi.fn(), update: vi.fn() },
    crawlSnapshot: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/firecrawl", () => ({
  firecrawlClient: { map: vi.fn() },
}));

vi.mock("@/app/api/crawl/route", () => ({
  normalizeUrl: (url: string) => url,
}));

vi.mock("@/lib/checkSubscription", () => ({
  checkSubscription: vi.fn().mockResolvedValue(true),
}));

import { prisma } from "@/lib/prisma";
import { GET } from "@/app/api/cron/crawl/route";

const CRON_SECRET = "test-cron-secret";

function makeRequest(auth?: string) {
  return new Request("http://localhost:3000/api/cron/crawl", {
    method: "GET",
    headers: auth ? { authorization: auth } : {},
  }) as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
});

describe("GET /api/cron/crawl — authorization", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(prisma.dealer.findMany).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header has wrong secret", async () => {
    const res = await GET(makeRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    expect(prisma.dealer.findMany).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET env var is not set", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("proceeds with valid secret and returns success response", async () => {
    vi.mocked(prisma.dealer.findMany).mockResolvedValue([] as never);

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ triggered: 0, skipped: 0 });
    expect(prisma.dealer.findMany).toHaveBeenCalled();
  });
});

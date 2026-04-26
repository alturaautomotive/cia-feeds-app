import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.CRON_SECRET = "test-cron-secret";
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealer: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/meta", () => ({
  decryptToken: vi.fn(),
  refreshToken: vi.fn(),
}));

vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { decryptToken, refreshToken } from "@/lib/meta";
import { encrypt } from "@/lib/crypto";
import { GET } from "@/app/api/cron/refresh-meta-tokens/route";

const CRON_SECRET = "test-cron-secret";
const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

function makeRequest(auth?: string) {
  return new Request("http://localhost:3000/api/cron/refresh-meta-tokens", {
    method: "GET",
    headers: auth ? { authorization: auth } : {},
  }) as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
  vi.mocked(encrypt).mockReturnValue("encrypted-token");
  vi.mocked(decryptToken).mockReturnValue("decrypted-token");
  vi.mocked(refreshToken).mockResolvedValue({ token: "new-token", expiresAt: FUTURE_DATE });
  vi.mocked(prisma.dealer.update).mockResolvedValue({} as never);
});

describe("GET /api/cron/refresh-meta-tokens", () => {
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

  it("returns { refreshed:0, skipped:0, failed:0 } when no dealers match", async () => {
    vi.mocked(prisma.dealer.findMany).mockResolvedValue([] as never);
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ refreshed: 0, skipped: 0, failed: 0 });
    expect(prisma.dealer.update).not.toHaveBeenCalled();
  });

  it("refreshes a dealer and updates only metaAccessToken and metaTokenExpiresAt", async () => {
    vi.mocked(prisma.dealer.findMany).mockResolvedValue([
      { id: "dealer-1", metaAccessToken: "encrypted-old", metaTokenExpiresAt: FUTURE_DATE },
    ] as never);
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ refreshed: 1, skipped: 0, failed: 0 });
    expect(decryptToken).toHaveBeenCalledWith("encrypted-old");
    expect(refreshToken).toHaveBeenCalledWith("decrypted-token");
    expect(encrypt).toHaveBeenCalledWith("new-token");
    expect(prisma.dealer.update).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.dealer.update).mock.calls[0][0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(call.where).toEqual({ id: "dealer-1" });
    expect(Object.keys(call.data).sort()).toEqual(["metaAccessToken", "metaTokenExpiresAt"].sort());
    expect(call.data.metaAccessToken).toBe("encrypted-token");
    expect(call.data.metaTokenExpiresAt).toBe(FUTURE_DATE);
  });

  it("skips a dealer whose metaAccessToken is null", async () => {
    vi.mocked(prisma.dealer.findMany).mockResolvedValue([
      { id: "dealer-null-token", metaAccessToken: null, metaTokenExpiresAt: FUTURE_DATE },
    ] as never);
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();
    expect(body).toEqual({ refreshed: 0, skipped: 1, failed: 0 });
    expect(prisma.dealer.update).not.toHaveBeenCalled();
  });

  it("skips a dealer whose metaTokenExpiresAt is null", async () => {
    vi.mocked(prisma.dealer.findMany).mockResolvedValue([
      { id: "dealer-null-expiry", metaAccessToken: "some-token", metaTokenExpiresAt: null },
    ] as never);
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();
    expect(body).toEqual({ refreshed: 0, skipped: 1, failed: 0 });
    expect(prisma.dealer.update).not.toHaveBeenCalled();
  });

  it("records failed dealer when refreshToken throws and continues to next dealer", async () => {
    vi.mocked(prisma.dealer.findMany).mockResolvedValue([
      { id: "dealer-fail", metaAccessToken: "encrypted-old", metaTokenExpiresAt: FUTURE_DATE },
      { id: "dealer-ok", metaAccessToken: "encrypted-ok", metaTokenExpiresAt: FUTURE_DATE },
    ] as never);
    vi.mocked(refreshToken)
      .mockRejectedValueOnce(new Error("token exchange failed"))
      .mockResolvedValueOnce({ token: "new-token", expiresAt: FUTURE_DATE });
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();
    expect(body).toEqual({ refreshed: 1, skipped: 0, failed: 1 });
    expect(prisma.dealer.update).toHaveBeenCalledTimes(1);
  });

  it("two dealers: one success, one failure — returns correct counts", async () => {
    vi.mocked(prisma.dealer.findMany).mockResolvedValue([
      { id: "dealer-A", metaAccessToken: "token-A", metaTokenExpiresAt: FUTURE_DATE },
      { id: "dealer-B", metaAccessToken: "token-B", metaTokenExpiresAt: FUTURE_DATE },
    ] as never);
    vi.mocked(refreshToken)
      .mockResolvedValueOnce({ token: "new-A", expiresAt: FUTURE_DATE })
      .mockRejectedValueOnce(new Error("Graph API error"));
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();
    expect(body).toEqual({ refreshed: 1, skipped: 0, failed: 1 });
  });
});

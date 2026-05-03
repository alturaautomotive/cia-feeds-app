import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => {
  const mp: Record<string, unknown> = {
    dealer: { findUnique: vi.fn(), update: vi.fn() },
    adminAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { mockPrisma: mp };
});

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("next-auth", () => ({
  default: vi.fn(),
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, authOptions: {} };
});

vi.mock("@/lib/impersonation", () => ({
  getEffectiveDealerContext: vi.fn(),
}));

vi.mock("@/lib/checkSubscription", () => ({
  checkSubscription: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/meta", () => ({
  loadDealerToken: vi.fn().mockResolvedValue("valid-token"),
}));

vi.mock("@/lib/metaDelivery", () => ({
  API_SUPPORTED_VERTICALS: new Set(["automotive", "services"]),
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn().mockReturnValue("decrypted"),
}));

import { PATCH } from "@/app/api/profile/route";
import { getServerSession } from "next-auth";
import { getEffectiveDealerContext } from "@/lib/impersonation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = mockPrisma as any;

const DEALER_ID = "dealer-001";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Parameters<typeof PATCH>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  (getEffectiveDealerContext as ReturnType<typeof vi.fn>).mockResolvedValue({
    effectiveDealerId: DEALER_ID,
    isImpersonating: false,
    sessionUserId: DEALER_ID,
    hasStaleImpersonationCookie: false,
  });
  (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: DEALER_ID, email: "dealer@example.com" },
  });
  (prisma.adminAuditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
  // Default $transaction implementation: execute the callback with tx-like client
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      return fn(prisma);
    }
  );
});

describe("PATCH /api/profile — metaDeliveryMethod audit", () => {
  it("writes an audit log when delivery method changes from csv to api", async () => {
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: DEALER_ID,
      vertical: "automotive",
      metaCatalogId: "cat-123",
      metaAccessToken: "enc-tok",
      metaTokenExpiresAt: new Date(Date.now() + 86400000),
      metaDeliveryMethod: "csv",
    });
    (prisma.dealer.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await PATCH(makeRequest({ metaDeliveryMethod: "api" }));
    expect(res.status).toBe(200);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "profile.meta_delivery_method.update",
          actorEmail: "dealer@example.com",
          actorRole: "dealer",
          actorDealerId: DEALER_ID,
          targetDealerId: DEALER_ID,
          beforeState: { metaDeliveryMethod: "csv" },
          afterState: { metaDeliveryMethod: "api" },
        }),
      })
    );
  });

  it("writes an audit log when delivery method changes from api to csv", async () => {
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: DEALER_ID,
      vertical: "automotive",
      metaCatalogId: "cat-123",
      metaAccessToken: "enc-tok",
      metaTokenExpiresAt: new Date(Date.now() + 86400000),
      metaDeliveryMethod: "api",
    });
    (prisma.dealer.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await PATCH(makeRequest({ metaDeliveryMethod: "csv" }));
    expect(res.status).toBe(200);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "profile.meta_delivery_method.update",
          beforeState: { metaDeliveryMethod: "api" },
          afterState: { metaDeliveryMethod: "csv" },
        }),
      })
    );
  });

  it("does NOT write an audit log when delivery method is unchanged", async () => {
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: DEALER_ID,
      vertical: "automotive",
      metaCatalogId: "cat-123",
      metaAccessToken: "enc-tok",
      metaTokenExpiresAt: new Date(Date.now() + 86400000),
      metaDeliveryMethod: "csv",
    });
    (prisma.dealer.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await PATCH(makeRequest({ metaDeliveryMethod: "csv" }));
    expect(res.status).toBe(200);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("does NOT write an audit record when the DB update fails", async () => {
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: DEALER_ID,
      vertical: "automotive",
      metaCatalogId: "cat-123",
      metaAccessToken: "enc-tok",
      metaTokenExpiresAt: new Date(Date.now() + 86400000),
      metaDeliveryMethod: "csv",
    });

    // Simulate transaction failure (e.g. DB write fails)
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("simulated DB failure")
    );

    const res = await PATCH(makeRequest({ metaDeliveryMethod: "api" }));
    // The route's catch block returns 500
    expect(res.status).toBe(500);

    // Because the transaction rolled back, audit should NOT have been persisted
    // (the create call inside the failed transaction is rolled back by Prisma)
    expect(prisma.$transaction).toHaveBeenCalled();
    // Verify the audit create was never called outside a transaction
    // In a real DB the transaction rollback undoes the audit write;
    // with our mock rejecting, the callback never completes
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });
});

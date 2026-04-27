import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => {
  process.env.ADMIN_EMAIL = "admin@test.com";
  const mp: Record<string, unknown> = {
    dealer: { findUnique: vi.fn(), update: vi.fn() },
    adminAllowlist: { findUnique: vi.fn(), findFirst: vi.fn() },
    adminAuditLog: { create: vi.fn() },
    rateLimitBucket: { upsert: vi.fn() },
  };
  mp.$transaction = vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mp));
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

vi.mock("@/lib/meta", () => ({
  loadDealerToken: vi.fn().mockResolvedValue("valid-token"),
}));

vi.mock("@/lib/metaDelivery", () => ({
  API_SUPPORTED_VERTICALS: new Set(["automotive"]),
}));

import { PATCH } from "@/app/api/admin/dealers/[id]/meta-delivery/route";
import { getServerSession } from "next-auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = mockPrisma as any;

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/admin/dealers/00000000-0000-0000-0000-000000000001/meta-delivery", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_ID = "00000000-0000-0000-0000-000000000001";

describe("PATCH /api/admin/dealers/[id]/meta-delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.rateLimitBucket.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1, windowStart: new Date(), windowMs: 60000, expiresAt: new Date(Date.now() + 120000),
    });
  });

  it("returns 403 for unauthorized user", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "nobody@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const req = makeRequest({ metaDeliveryMethod: "csv" });
    const res = await PATCH(req as Parameters<typeof PATCH>[0], {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid metaDeliveryMethod", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "admin@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const req = makeRequest({ metaDeliveryMethod: "invalid" });
    const res = await PATCH(req as Parameters<typeof PATCH>[0], {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid dealer id param", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "admin@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const req = makeRequest({ metaDeliveryMethod: "csv" });
    const res = await PATCH(req as Parameters<typeof PATCH>[0], {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("creates audit log on successful update", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "admin@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: VALID_ID,
      vertical: "automotive",
      metaCatalogId: "cat-123",
      metaAccessToken: "tok",
      metaTokenExpiresAt: new Date(Date.now() + 86400000),
      metaDeliveryMethod: "csv",
    });
    (prisma.dealer.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: VALID_ID,
      metaDeliveryMethod: "api",
    });
    (prisma.adminAuditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const req = makeRequest({ metaDeliveryMethod: "api" });
    const res = await PATCH(req as Parameters<typeof PATCH>[0], {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(200);

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "admin.meta_delivery.update",
          actorEmail: "admin@test.com",
          beforeState: { metaDeliveryMethod: "csv" },
          afterState: { metaDeliveryMethod: "api" },
        }),
      })
    );
  });

  it("returns 400 for unknown fields in body", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "admin@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const req = makeRequest({ metaDeliveryMethod: "csv", unknownField: "foo" });
    const res = await PATCH(req as Parameters<typeof PATCH>[0], {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("validation_error");
  });

  it("authorizes via AdminAllowlist entry", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "allowlisted@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "allowlisted@test.com",
      role: "admin",
      isActive: true,
    });
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: VALID_ID,
      vertical: "automotive",
      metaCatalogId: null,
      metaAccessToken: null,
      metaTokenExpiresAt: null,
      metaDeliveryMethod: "api",
    });
    (prisma.dealer.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: VALID_ID,
      metaDeliveryMethod: "csv",
    });
    (prisma.adminAuditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const req = makeRequest({ metaDeliveryMethod: "csv" });
    const res = await PATCH(req as Parameters<typeof PATCH>[0], {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(200);
  });

  it("authorizes when allowlist email is stored with mixed case", async () => {
    // Session email will be lowercased by adminGuard; the stored row has mixed case.
    // The case-insensitive findFirst lookup should still match.
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "Admin@Test.COM" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "Admin@Test.COM",
      role: "admin",
      isActive: true,
    });
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: VALID_ID,
      vertical: "automotive",
      metaCatalogId: null,
      metaAccessToken: null,
      metaTokenExpiresAt: null,
      metaDeliveryMethod: "api",
    });
    (prisma.dealer.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: VALID_ID,
      metaDeliveryMethod: "csv",
    });
    (prisma.adminAuditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const req = makeRequest({ metaDeliveryMethod: "csv" });
    const res = await PATCH(req as Parameters<typeof PATCH>[0], {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(200);
  });
});

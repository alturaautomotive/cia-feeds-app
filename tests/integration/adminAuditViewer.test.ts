import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  adminGuard: vi.fn(),
  authOptions: {},
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/metaDelivery", () => ({
  unblockDealerJobs: vi.fn().mockResolvedValue(7),
}));

vi.mock("@/lib/adminAudit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/rateLimit", () => ({
  criticalDurableRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/requestSchemas", () => ({
  adminMetaDeliveryUnblockSchema: {
    safeParse: (data: unknown) => {
      const d = data as Record<string, unknown>;
      if (d && d.dealerId) return { success: true, data: { dealerId: d.dealerId } };
      return { success: false, error: { flatten: () => ({ fieldErrors: {} }) } };
    },
  },
}));

import { adminGuard } from "@/lib/auth";
import { redirect } from "next/navigation";
import { unblockDealerJobs } from "@/lib/metaDelivery";
import { writeAuditLog } from "@/lib/adminAudit";

const { prisma } = await import("@/lib/prisma");

describe("Audit Log Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminGuard).mockResolvedValue({
      ok: true,
      email: "admin@x.com",
      role: "super_admin",
    });
  });

  it("queries prisma with correct filters and pagination", async () => {
    (prisma.adminAuditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "1", action: "test", actorEmail: "a@b.com", actorRole: "admin", createdAt: new Date(), beforeState: {}, afterState: {}, metadata: {}, targetDealerId: null },
      { id: "2", action: "test", actorEmail: "a@b.com", actorRole: "admin", createdAt: new Date(), beforeState: {}, afterState: {}, metadata: {}, targetDealerId: null },
      { id: "3", action: "test", actorEmail: "a@b.com", actorRole: "admin", createdAt: new Date(), beforeState: {}, afterState: {}, metadata: {}, targetDealerId: null },
    ]);
    (prisma.adminAuditLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(120);

    const AuditLogPage = (await import("@/app/admin/audit/page")).default;

    const result = await AuditLogPage({
      searchParams: Promise.resolve({
        action: "admin.meta_delivery.unblock",
        actorEmail: "alice",
        from: "2026-01-01",
        to: "2026-12-31",
        page: "2",
      }),
    });

    expect(result).toBeTruthy();

    expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
        skip: 50,
        where: expect.objectContaining({
          action: "admin.meta_delivery.unblock",
          actorEmail: { contains: "alice", mode: "insensitive" },
        }),
      })
    );

    const findManyCall = (prisma.adminAuditLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findManyCall.where.createdAt).toBeTruthy();
    expect(findManyCall.where.createdAt.gte).toBeInstanceOf(Date);
    expect(findManyCall.where.createdAt.lte).toBeInstanceOf(Date);

    expect(prisma.adminAuditLog.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: "admin.meta_delivery.unblock",
        }),
      })
    );
  });

  it("redirects when admin guard fails", async () => {
    vi.mocked(adminGuard).mockResolvedValue({
      ok: false,
      email: "",
      role: "",
    });

    const AuditLogPage = (await import("@/app/admin/audit/page")).default;

    await AuditLogPage({
      searchParams: Promise.resolve({}),
    });

    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});

describe("POST /api/admin/meta-delivery/unblock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminGuard).mockResolvedValue({
      ok: true,
      email: "admin@x.com",
      role: "super_admin",
    });
  });

  it("unblocks dealer jobs and writes audit log", async () => {
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "d-1" });
    (prisma.metaDeliveryJob.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);

    const { POST } = await import("@/app/api/admin/meta-delivery/unblock/route");

    const req = new NextRequest("http://localhost:3000/api/admin/meta-delivery/unblock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId: "d-1" }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.unblockedCount).toBe(7);

    expect(unblockDealerJobs).toHaveBeenCalledWith("d-1");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.meta_delivery.unblock",
        actorEmail: "admin@x.com",
        actorRole: "super_admin",
        targetDealerId: "d-1",
        beforeState: { blockedJobs: 2 },
        afterState: { unblockedCount: 7 },
      })
    );
  });

  it("returns 404 when dealer not found", async () => {
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { POST } = await import("@/app/api/admin/meta-delivery/unblock/route");

    const req = new NextRequest("http://localhost:3000/api/admin/meta-delivery/unblock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId: "nonexistent" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 403 when admin guard fails", async () => {
    vi.mocked(adminGuard).mockResolvedValue({
      ok: false,
      email: "",
      role: "",
      response: new (await import("next/server")).NextResponse(
        JSON.stringify({ error: "forbidden" }),
        { status: 403 }
      ),
    });

    const { POST } = await import("@/app/api/admin/meta-delivery/unblock/route");

    const req = new NextRequest("http://localhost:3000/api/admin/meta-delivery/unblock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId: "d-1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

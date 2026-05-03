import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.ADMIN_EMAIL = "admin@test.com";
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealer: { findUnique: vi.fn(), findMany: vi.fn() },
    vehicle: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    adminAllowlist: { findUnique: vi.fn(), findFirst: vi.fn() },
    adminAuditLog: { create: vi.fn() },
    rateLimitBucket: { upsert: vi.fn() },
  },
}));

vi.mock("next-auth", () => ({
  default: vi.fn(),
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, authOptions: {} };
});

vi.mock("@/lib/scrape", () => ({
  scrapeVehicleUrl: vi.fn(),
}));

vi.mock("@/lib/metaDelivery", () => ({
  dispatchFeedDeliveryInBackground: vi.fn(),
}));

// Mock next/server's `after` to no-op
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

import { POST, GET } from "@/app/api/admin/feed-rescrape/route";
import { getServerSession } from "next-auth";

const { prisma } = await import("@/lib/prisma");

const VALID_UUID = "00000000-0000-0000-0000-000000000001";

describe("POST /api/admin/feed-rescrape", () => {
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

    const req = new Request("http://localhost:3000/api/admin/feed-rescrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid dealerId (not a uuid)", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "admin@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "admin@test.com", role: "admin", isActive: true,
    });

    const req = new Request("http://localhost:3000/api/admin/feed-rescrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId: "not-a-uuid" }),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("validation_error");
  });

  it("returns 400 for invalid vertical", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "admin@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "admin@test.com", role: "admin", isActive: true,
    });

    const req = new Request("http://localhost:3000/api/admin/feed-rescrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vertical: "invalid_vertical" }),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown fields in body", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "admin@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "admin@test.com", role: "admin", isActive: true,
    });

    const req = new Request("http://localhost:3000/api/admin/feed-rescrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId: VALID_UUID, unknownField: "foo" }),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("validation_error");
  });

  it("bulk mode succeeds with default vertical and filters in app logic", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "admin@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "admin@test.com", role: "admin", isActive: true,
    });
    (prisma.dealer.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "d1", vertical: "automotive" },
      { id: "d2", vertical: "services" },
      { id: "d3", vertical: "automotive" },
    ]);
    (prisma.vehicle.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "v1", url: "http://example.com/car1", dealerId: "d1" },
      { id: "v2", url: "http://example.com/car2", dealerId: "d3" },
    ]);
    (prisma.vehicle.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 });
    (prisma.adminAuditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/feed-rescrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dealerCount).toBe(2);
    expect(data.vehicleCount).toBe(2);

    // Verify dealer query does NOT include vertical in where clause (app-side filtering)
    const findManyCall = (prisma.dealer.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findManyCall.where).toEqual({ active: true });
    expect(findManyCall.where).not.toHaveProperty("vertical");
    expect(findManyCall.select).toHaveProperty("vertical", true);
  });

  it("bulk mode with explicit vertical filters correctly", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "admin@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "admin@test.com", role: "admin", isActive: true,
    });
    (prisma.dealer.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "d1", vertical: "automotive" },
      { id: "d2", vertical: "services" },
    ]);
    (prisma.vehicle.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "v1", url: "http://example.com/svc", dealerId: "d2" },
    ]);
    (prisma.vehicle.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    (prisma.adminAuditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/feed-rescrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vertical: "services" }),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dealerCount).toBe(1);
  });

  it("audit log uses actual dealer vertical for single-dealer non-automotive rescrape", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "admin@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "admin@test.com", role: "admin", isActive: true,
    });
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: VALID_UUID, vertical: "services" });
    (prisma.vehicle.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "v1", url: "http://example.com/svc", dealerId: VALID_UUID },
    ]);
    (prisma.vehicle.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    (prisma.adminAuditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/feed-rescrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId: VALID_UUID }),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          beforeState: expect.objectContaining({
            vertical: "services",
          }),
          metadata: expect.objectContaining({
            vertical: "services",
          }),
        }),
      })
    );
  });

  it("writes audit log on successful trigger", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "admin@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "admin@test.com", role: "admin", isActive: true,
    });
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: VALID_UUID });
    (prisma.vehicle.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "v1", url: "http://example.com/car", dealerId: VALID_UUID },
    ]);
    (prisma.vehicle.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    (prisma.adminAuditLog.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/feed-rescrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId: VALID_UUID }),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.vehicleCount).toBe(1);

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "admin.feed_rescrape.trigger",
          actorEmail: "admin@test.com",
          beforeState: expect.objectContaining({
            dealerId: VALID_UUID,
            scope: "single_dealer",
          }),
          afterState: expect.objectContaining({
            dealerCount: 1,
            vehicleCount: 1,
            status: "rescraping",
          }),
        }),
      })
    );
  });
});

describe("GET /api/admin/feed-rescrape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for unauthorized user", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "nobody@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost:3000/api/admin/feed-rescrape");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid dealerId query param", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "admin@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "admin@test.com", role: "admin", isActive: true,
    });

    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost:3000/api/admin/feed-rescrape?dealerId=not-a-uuid");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/feed-rescrape (hardened security)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.rateLimitBucket.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1, windowStart: new Date(), windowMs: 60000, expiresAt: new Date(Date.now() + 120000),
    });
  });

  it("returns 403 for viewer role (insufficient capability for trigger_rescrape)", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "viewer@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "viewer@test.com",
      role: "viewer",
      isActive: true,
    });

    const req = new Request("http://localhost:3000/api/admin/feed-rescrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.detail).toBe("insufficient_role");
  });

  it("returns 403 for inactive allowlist entry", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "inactive@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "inactive@test.com",
      role: "admin",
      isActive: false,
    });

    const req = new Request("http://localhost:3000/api/admin/feed-rescrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(403);
  });

  it("does not write audit log when authorization fails", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "nobody@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/admin/feed-rescrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    await POST(req as Parameters<typeof POST>[0]);
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("does not write audit log when validation fails", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "admin@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "admin@test.com",
      role: "admin",
      isActive: true,
    });

    const req = new Request("http://localhost:3000/api/admin/feed-rescrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId: "not-a-uuid" }),
    });

    await POST(req as Parameters<typeof POST>[0]);
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("enforces actor-scoped rate limit after successful auth", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "admin@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      email: "admin@test.com", role: "admin", isActive: true,
    });

    // First call (pre-auth IP limiter) passes, second call (actor-scoped) is over limit
    let upsertCallCount = 0;
    (prisma.rateLimitBucket.upsert as ReturnType<typeof vi.fn>).mockImplementation(() => {
      upsertCallCount++;
      if (upsertCallCount <= 1) {
        return Promise.resolve({ count: 1, windowStart: new Date(), windowMs: 60000, expiresAt: new Date(Date.now() + 120000) });
      }
      return Promise.resolve({ count: 6, windowStart: new Date(), windowMs: 60000, expiresAt: new Date(Date.now() + 120000) });
    });

    const req = new Request("http://localhost:3000/api/admin/feed-rescrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(429);

    // Verify actor-scoped key was used (second upsert call includes actor email)
    const secondCall = (prisma.rateLimitBucket.upsert as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(secondCall.where.key_windowStart.key).toContain("actor:admin@test.com");
  });

  it("returns 429 (fail-closed) when critical rate limiter DB fails", async () => {
    (prisma.rateLimitBucket.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("DB connection timeout")
    );

    const req = new Request("http://localhost:3000/api/admin/feed-rescrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe("rate_limited");
  });

  it("ADMIN_EMAIL env does not grant access when allowlist lookup succeeds but entry not found", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: "admin@test.com" },
    });
    (prisma.adminAllowlist.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/admin/feed-rescrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(403);
  });
});

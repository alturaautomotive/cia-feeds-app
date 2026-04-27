import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/signup/route";
import { POST as ForgotPOST } from "@/app/api/auth/forgot-password/route";

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed_password") },
  hash: vi.fn().mockResolvedValue("hashed_password"),
}));

// Mock email module
vi.mock("@/lib/email", () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendAdminNewSignupEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

const { prisma } = await import("@/lib/prisma");

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: rate limit bucket allows request
    (prisma.rateLimitBucket.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1, windowStart: new Date(), windowMs: 60000, expiresAt: new Date(Date.now() + 120000),
    });
  });

  it("creates a dealer and returns correct slug", async () => {
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.dealer.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.dealer.create as ReturnType<typeof vi.fn>).mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "dealer-uuid", createdAt: new Date(), ...data })
    );
    (prisma.subAccount.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "sub-uuid" });
    (prisma.dealer.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Tim Short Ford", email: "tim@ford.com", password: "password123" }),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(prisma.dealer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "tim-short-ford" }),
      })
    );
    expect(data.slug).toBe("tim-short-ford");
    expect(data.feedUrl).toContain("tim-short-ford");
  });

  it("appends numeric suffix when base slug already exists", async () => {
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.dealer.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { slug: "tim-short-ford" },
    ]);
    (prisma.dealer.create as ReturnType<typeof vi.fn>).mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "dealer-uuid-2", createdAt: new Date(), ...data })
    );
    (prisma.subAccount.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "sub-uuid-2" });
    (prisma.dealer.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Tim Short Ford", email: "tim2@ford.com", password: "password123" }),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);

    expect(res.status).toBe(201);
    expect(prisma.dealer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "tim-short-ford-2" }),
      })
    );
  });

  it("returns 409 if email already taken", async () => {
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "existing-id",
      email: "taken@example.com",
    });

    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Dealer", email: "taken@example.com", password: "password123" }),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(409);
  });

  it("returns 400 when required fields are missing", async () => {
    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Incomplete Dealer" }),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  it("returns 429 when durable rate limit is exceeded", async () => {
    (prisma.rateLimitBucket.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 10, windowStart: new Date(), windowMs: 60000, expiresAt: new Date(Date.now() + 120000),
    });

    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dealer", email: "new@test.com", password: "password123" }),
    });

    const res = await POST(req as Parameters<typeof POST>[0]);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe("rate_limited");
    expect(data.retryAfterMs).toBeDefined();
  });
});

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.rateLimitBucket.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1, windowStart: new Date(), windowMs: 60000, expiresAt: new Date(Date.now() + 120000),
    });
  });

  it("returns 429 when durable rate limit is exceeded", async () => {
    (prisma.rateLimitBucket.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 10, windowStart: new Date(), windowMs: 60000, expiresAt: new Date(Date.now() + 120000),
    });

    const req = new Request("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });

    const res = await ForgotPOST(req as Parameters<typeof ForgotPOST>[0]);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe("rate_limited");
  });

  it("returns success for valid email (does not reveal existence)", async () => {
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nonexistent@example.com" }),
    });

    const res = await ForgotPOST(req as Parameters<typeof ForgotPOST>[0]);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});

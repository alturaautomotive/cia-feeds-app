import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/signup/route";

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed_password") },
  hash: vi.fn().mockResolvedValue("hashed_password"),
}));

const { prisma } = await import("@/lib/prisma");

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a dealer and returns correct slug", async () => {
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.dealer.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.dealer.create as ReturnType<typeof vi.fn>).mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "dealer-uuid", createdAt: new Date(), ...data })
    );

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
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed") },
  hash: vi.fn().mockResolvedValue("hashed"),
}));

vi.mock("@/lib/email", () => ({
  sendTeamPasswordSetEmail: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from "@/app/api/team/accept/route";
import bcrypt from "bcryptjs";
import { sendTeamPasswordSetEmail } from "@/lib/email";

const { prisma } = await import("@/lib/prisma");

const FUTURE = new Date(Date.now() + 86400000);
const PAST = new Date(Date.now() - 86400000);

function makeInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    token: "tok123",
    email: "bob@test.com",
    dealerId: "d-1",
    subAccountId: "sub-1",
    role: "editor",
    expiresAt: FUTURE,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeGetRequest(token: string) {
  return new NextRequest(`http://localhost:3000/api/team/accept?token=${encodeURIComponent(token)}`);
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/team/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/team/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns invite info for valid token", async () => {
    (prisma.teamInvite.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(makeInvite());
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ name: "Acme" });

    const res = await GET(makeGetRequest("tok123"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.email).toBe("bob@test.com");
    expect(data.dealerName).toBe("Acme");
    expect(data.role).toBe("editor");
    expect(data.expired).toBe(false);
  });

  it("returns expired true for expired token", async () => {
    (prisma.teamInvite.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeInvite({ expiresAt: PAST })
    );

    const res = await GET(makeGetRequest("tok123"));
    const data = await res.json();

    expect(data.expired).toBe(true);
  });

  it("returns 404 for unknown token", async () => {
    (prisma.teamInvite.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(makeGetRequest("bad"));
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing token", async () => {
    const res = await GET(makeGetRequest(""));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/team/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.teamInvite.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(makeInvite());
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ name: "Acme" });
    (prisma.teamUser.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.teamUser.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.teamInvite.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it("happy path: creates user, deletes invite, sends email", async () => {
    const res = await POST(makePostRequest({ token: "tok123", name: "Bob", password: "12345678" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.email).toBe("bob@test.com");

    expect(bcrypt.hash).toHaveBeenCalledWith("12345678", 10);
    expect(prisma.teamUser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: "hashed",
          name: "Bob",
          role: "editor",
          dealerId: "d-1",
          subAccountId: "sub-1",
        }),
      })
    );
    expect(prisma.teamInvite.delete).toHaveBeenCalledWith({ where: { id: "inv-1" } });
    expect(sendTeamPasswordSetEmail).toHaveBeenCalledOnce();
  });

  it("re-accept path: updates existing user without passwordHash", async () => {
    (prisma.teamUser.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tu-1",
      passwordHash: null,
    });
    (prisma.teamUser.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await POST(makePostRequest({ token: "tok123", name: "Bob", password: "12345678" }));
    expect(res.status).toBe(200);
    expect(prisma.teamUser.update).toHaveBeenCalled();
    expect(prisma.teamUser.create).not.toHaveBeenCalled();
  });

  it("returns 409 when already accepted", async () => {
    (prisma.teamUser.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tu-1",
      passwordHash: "abc",
    });

    const res = await POST(makePostRequest({ token: "tok123", name: "Bob", password: "12345678" }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("already_accepted");
    expect(prisma.teamInvite.delete).not.toHaveBeenCalled();
  });

  it("returns 410 for expired token", async () => {
    (prisma.teamInvite.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeInvite({ expiresAt: PAST })
    );

    const res = await POST(makePostRequest({ token: "tok123", name: "Bob", password: "12345678" }));
    expect(res.status).toBe(410);
    const data = await res.json();
    expect(data.error).toBe("token_expired");
    expect(prisma.teamInvite.delete).toHaveBeenCalledOnce();
  });

  it("returns 404 for invalid token", async () => {
    (prisma.teamInvite.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(makePostRequest({ token: "nope", name: "Bob", password: "12345678" }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("invalid_token");
  });

  it("returns 400 for missing password", async () => {
    const res = await POST(makePostRequest({ token: "tok123", name: "Bob" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("validation_error");
  });
});

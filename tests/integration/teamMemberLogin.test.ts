import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCompare = vi.fn();
vi.mock("bcryptjs", () => ({
  default: { compare: (...args: unknown[]) => mockCompare(...args) },
  compare: (...args: unknown[]) => mockCompare(...args),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { authOptions } from "@/lib/auth";
const { prisma } = await import("@/lib/prisma");

// Extract the authorize function from the credentials provider
const credentialsProvider = authOptions.providers[0];
const authorize = (credentialsProvider as { options: { authorize: (creds: Record<string, string>) => Promise<unknown> } }).options.authorize;

function makeTeamUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "tu-1",
    name: "Bob",
    email: "bob@test.com",
    passwordHash: "hash123",
    role: "editor",
    subAccountId: "sub-1",
    acceptedAt: new Date(),
    dealer: {
      id: "d-1",
      active: true,
      name: "Acme",
      email: "owner@acme.com",
      slug: "acme",
      vertical: "automotive",
      passwordHash: "dealer-hash",
      defaultSubAccountId: null,
      subAccounts: [{ id: "sub-default" }],
    },
    ...overrides,
  };
}

describe("authorize (team member login)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.teamUser.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.dealer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.teamUser.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it("happy path: team user login returns correct shape", async () => {
    (prisma.teamUser.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeTeamUser()]);
    mockCompare.mockResolvedValue(true);

    const result = await authorize({ email: "bob@test.com", password: "pw" });

    expect(result).toBeTruthy();
    expect((result as Record<string, unknown>).id).toBe("d-1");
    expect((result as Record<string, unknown>).slug).toBe("acme");
    expect((result as Record<string, unknown>).vertical).toBe("automotive");
    expect((result as Record<string, unknown>).subAccountId).toBe("sub-1");
    expect((result as { teamUser: { id: string; role: string } }).teamUser.id).toBe("tu-1");
    expect((result as { teamUser: { id: string; role: string } }).teamUser.role).toBe("editor");
  });

  it("returns null for inactive dealer", async () => {
    (prisma.teamUser.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeTeamUser({ dealer: { ...makeTeamUser().dealer, active: false } }),
    ]);
    mockCompare.mockResolvedValue(true);

    const result = await authorize({ email: "bob@test.com", password: "pw" });
    expect(result).toBeNull();
  });

  it("returns null for bad password (no dealer fallback match)", async () => {
    (prisma.teamUser.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeTeamUser()]);
    mockCompare.mockResolvedValue(false);

    const result = await authorize({ email: "bob@test.com", password: "wrong" });
    expect(result).toBeNull();
  });

  it("falls back to dealer login when no team users found", async () => {
    (prisma.teamUser.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.dealer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "d-2",
      name: "Solo Dealer",
      email: "solo@test.com",
      slug: "solo",
      vertical: "services",
      passwordHash: "dhash",
      active: true,
      defaultSubAccountId: null,
      subAccounts: [{ id: "sub-s" }],
    });
    mockCompare.mockResolvedValue(true);
    (prisma.teamUser.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await authorize({ email: "solo@test.com", password: "pw" });

    expect(result).toBeTruthy();
    expect((result as Record<string, unknown>).id).toBe("d-2");
    expect((result as Record<string, unknown>).teamUser).toBeUndefined();
  });

  it("dealer fallback includes teamUser if found", async () => {
    (prisma.teamUser.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.dealer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "d-3",
      name: "Owner",
      email: "owner@test.com",
      slug: "owner",
      vertical: "automotive",
      passwordHash: "dhash",
      active: true,
      defaultSubAccountId: null,
      subAccounts: [{ id: "sub-o" }],
    });
    mockCompare.mockResolvedValue(true);
    (prisma.teamUser.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tu-owner",
      role: "admin",
      subAccountId: "sub-o",
    });

    const result = await authorize({ email: "owner@test.com", password: "pw" });

    expect(result).toBeTruthy();
    expect((result as { teamUser: { id: string; role: string } }).teamUser.id).toBe("tu-owner");
    expect((result as { teamUser: { id: string; role: string } }).teamUser.role).toBe("admin");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealer: { findUnique: vi.fn(), update: vi.fn() },
    rateLimitBucket: { upsert: vi.fn() },
  },
}));

vi.mock("@/lib/meta", () => ({
  authGuard: vi.fn(),
  loadDealerToken: vi.fn().mockResolvedValue("valid-token"),
  graphFetch: vi.fn(),
}));

vi.mock("@/lib/catalogOwnership", () => ({
  CATALOG_OWNERSHIP: { CREATED: "created", SELECTED: "selected" },
}));

vi.mock("@/lib/verticals", () => ({
  VERTICAL_META_TYPE: { automotive: "automotive_models" },
}));

import { POST as CreatePOST } from "@/app/api/meta/catalog/create/route";
import { POST as SelectPOST } from "@/app/api/meta/catalog/select/route";
import { authGuard, graphFetch } from "@/lib/meta";

const { prisma } = await import("@/lib/prisma");

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/meta/catalog/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/meta/catalog/create - validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authGuard as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, dealerId: "d1" });
    (prisma.rateLimitBucket.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1, windowStart: new Date(), windowMs: 60000, expiresAt: new Date(Date.now() + 120000),
    });
  });

  it("rejects missing businessId", async () => {
    const req = makeRequest({ catalogName: "My Catalog" });
    const res = await CreatePOST(req as Parameters<typeof CreatePOST>[0]);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("validation_error");
    expect(data.issues.businessId).toBeDefined();
  });

  it("rejects missing catalogName", async () => {
    const req = makeRequest({ businessId: "biz1" });
    const res = await CreatePOST(req as Parameters<typeof CreatePOST>[0]);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("validation_error");
    expect(data.issues.catalogName).toBeDefined();
  });

  it("rejects empty strings", async () => {
    const req = makeRequest({ businessId: "", catalogName: "" });
    const res = await CreatePOST(req as Parameters<typeof CreatePOST>[0]);
    expect(res.status).toBe(400);
  });

  it("rejects unknown fields", async () => {
    const req = makeRequest({ businessId: "biz1", catalogName: "My Catalog", extraField: "bad" });
    const res = await CreatePOST(req as Parameters<typeof CreatePOST>[0]);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("validation_error");
  });

  it("accepts valid payload and calls Meta API", async () => {
    (prisma.dealer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ vertical: "automotive" });
    (prisma.dealer.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (graphFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "catalog-123" }),
    });

    const req = makeRequest({ businessId: "biz1", catalogName: "My Catalog" });
    const res = await CreatePOST(req as Parameters<typeof CreatePOST>[0]);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.catalogId).toBe("catalog-123");
  });
});

describe("POST /api/meta/catalog/select - validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authGuard as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, dealerId: "d1" });
    (prisma.rateLimitBucket.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1, windowStart: new Date(), windowMs: 60000, expiresAt: new Date(Date.now() + 120000),
    });
  });

  it("rejects missing businessId", async () => {
    const req = new Request("http://localhost:3000/api/meta/catalog/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalogId: "cat1" }),
    });
    const res = await SelectPOST(req as Parameters<typeof SelectPOST>[0]);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("validation_error");
  });

  it("rejects missing catalogId", async () => {
    const req = new Request("http://localhost:3000/api/meta/catalog/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId: "biz1" }),
    });
    const res = await SelectPOST(req as Parameters<typeof SelectPOST>[0]);
    expect(res.status).toBe(400);
  });

  it("rejects unknown fields", async () => {
    const req = new Request("http://localhost:3000/api/meta/catalog/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId: "biz1", catalogId: "cat1", extraField: "bad" }),
    });
    const res = await SelectPOST(req as Parameters<typeof SelectPOST>[0]);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("validation_error");
  });

  it("accepts valid payload", async () => {
    (prisma.dealer.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const mockLoadDealerToken = (await import("@/lib/meta")).loadDealerToken as ReturnType<typeof vi.fn>;
    mockLoadDealerToken.mockResolvedValue("valid-token");

    const req = new Request("http://localhost:3000/api/meta/catalog/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId: "biz1", catalogId: "cat1" }),
    });
    const res = await SelectPOST(req as Parameters<typeof SelectPOST>[0]);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.catalogId).toBe("cat1");
  });
});

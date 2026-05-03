import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/checkSubscription", () => ({ checkSubscription: vi.fn() }));
vi.mock("@/lib/impersonation", () => ({ getEffectiveDealerId: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ decrypt: vi.fn() }));
vi.mock("@/lib/env", () => ({
  resolveMetaAppCredentials: () => ({ appId: "test-app-id", appSecret: "test-secret" }),
}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/server", () => ({
  NextResponse: { json: vi.fn() },
}));

import { graphFetch, GRAPH_BASE } from "@/lib/meta";

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
});

describe("graphFetch", () => {
  it("sends token in Authorization header, not in URL", async () => {
    await graphFetch("/me/accounts?fields=id,name", {}, "my-secret-token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];

    // URL must NOT contain the token
    expect(url).toBe(`${GRAPH_BASE}/me/accounts?fields=id,name`);
    expect(url).not.toContain("access_token");
    expect(url).not.toContain("my-secret-token");

    // Authorization header must be set
    const headers = new Headers(opts.headers);
    expect(headers.get("Authorization")).toBe("Bearer my-secret-token");
  });

  it("preserves existing query parameters in the endpoint", async () => {
    await graphFetch("/catalog123/check_batch_request_status?handle=abc", {}, "tok");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${GRAPH_BASE}/catalog123/check_batch_request_status?handle=abc`);
    expect(url).not.toContain("access_token");
  });

  it("preserves caller-supplied headers alongside Authorization", async () => {
    await graphFetch(
      "/catalog123/items_batch",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
      "tok"
    );

    const [, opts] = fetchMock.mock.calls[0];
    const headers = new Headers(opts.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer tok");
    expect(opts.method).toBe("POST");
    expect(opts.body).toBe("{}");
  });

  it("builds URL from GRAPH_BASE + endpoint for simple path", async () => {
    await graphFetch("/me", {}, "tok");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${GRAPH_BASE}/me`);
  });
});

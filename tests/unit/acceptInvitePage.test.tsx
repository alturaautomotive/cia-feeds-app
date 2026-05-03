// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignIn = vi.fn();
vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("token=tok123"),
}));

const locationHrefSpy = vi.fn();

import AcceptInvitePage from "@/app/team/accept/page";

describe("AcceptInvitePage", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "" },
    });
    Object.defineProperty(window.location, "href", {
      set: locationHrefSpy,
      get: () => "",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("completes the accept invite flow", async () => {
    fetchSpy.mockImplementation((url: string, opts?: { method?: string }) => {
      if (typeof url === "string" && url.includes("/api/team/accept") && (!opts || opts.method !== "POST")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ email: "x@y.com", dealerName: "Acme", role: "editor", expired: false }),
        });
      }
      if (typeof url === "string" && url.includes("/api/team/accept") && opts?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, email: "x@y.com" }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    mockSignIn.mockResolvedValue({ ok: true });

    render(<AcceptInvitePage />);

    const nameInput = await screen.findByLabelText(/Your name/i);
    const passwordInput = screen.getByLabelText("Password");

    const user = userEvent.setup();
    await user.type(nameInput, "Bob Smith");
    await user.type(passwordInput, "securepass");
    await user.click(screen.getByText(/Create account/));

    await waitFor(() => {
      const postCall = fetchSpy.mock.calls.find(
        (c: unknown[]) => typeof c[0] === "string" && c[0].includes("/api/team/accept") && (c[1] as { method?: string })?.method === "POST"
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse((postCall![1] as { body: string }).body);
      expect(body.token).toBe("tok123");
      expect(body.name).toBe("Bob Smith");
      expect(body.password).toBe("securepass");
    });

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("credentials", {
        email: "x@y.com",
        password: "securepass",
        redirect: false,
      });
    });

    await waitFor(() => {
      expect(locationHrefSpy).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows expired message for expired token", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ expired: true }),
    });

    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(screen.getByText(/This invite link has expired/)).toBeTruthy();
    });
    // No form should be shown
    expect(screen.queryByLabelText(/Your name/i)).toBeNull();
  });

  it("shows already accepted message on POST 409", async () => {
    fetchSpy.mockImplementation((url: string, opts?: { method?: string }) => {
      if (typeof url === "string" && url.includes("/api/team/accept") && (!opts || opts.method !== "POST")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ email: "x@y.com", dealerName: "Acme", role: "editor", expired: false }),
        });
      }
      if (typeof url === "string" && url.includes("/api/team/accept") && opts?.method === "POST") {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: "already_accepted" }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(<AcceptInvitePage />);

    const nameInput = await screen.findByLabelText(/Your name/i);
    const passwordInput = screen.getByLabelText("Password");

    const user = userEvent.setup();
    await user.type(nameInput, "Bob");
    await user.type(passwordInput, "12345678");
    await user.click(screen.getByText(/Create account/));

    await waitFor(() => {
      expect(screen.getByText(/You have already joined this team/)).toBeTruthy();
    });
  });
});

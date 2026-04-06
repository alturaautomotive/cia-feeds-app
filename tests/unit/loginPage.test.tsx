// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next-auth/react
const mockSignIn = vi.fn();
vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

// Mock next/link to render a plain anchor
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Stub window.location.href assignment
const locationHrefSpy = vi.fn();
beforeEach(() => {
  Object.defineProperty(window, "location", {
    writable: true,
    value: { href: "" },
  });
  locationHrefSpy.mockClear();
  Object.defineProperty(window.location, "href", {
    set: locationHrefSpy,
    get: () => "",
  });
});

import LoginPage from "@/app/login/page";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /dashboard on successful sign-in", async () => {
    mockSignIn.mockResolvedValue({ ok: true, error: null });

    render(<LoginPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email address/i), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "validpassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(locationHrefSpy).toHaveBeenCalledWith("/dashboard");
    });

    expect(mockSignIn).toHaveBeenCalledWith("credentials", {
      email: "test@example.com",
      password: "validpassword",
      callbackUrl: "/dashboard",
      redirect: false,
    });
  });

  it("displays error message for invalid credentials", async () => {
    mockSignIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });

    render(<LoginPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email address/i), "bad@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Invalid email or password.")).toBeTruthy();
    });

    expect(locationHrefSpy).not.toHaveBeenCalled();
  });
});

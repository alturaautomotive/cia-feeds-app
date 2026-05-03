// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SubscribeClient } from "@/app/subscribe/SubscribeClient";

const locationHrefSpy = vi.fn();

describe("SubscribeClient", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "", reload: vi.fn() },
    });
    Object.defineProperty(window.location, "href", {
      set: locationHrefSpy,
      get: () => "",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("applies promo code and passes it to checkout", async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/stripe/validate-promo") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ label: "10% off", promotionCodeId: "promo_1" }),
        });
      }
      if (url === "/api/stripe/checkout") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ url: "https://checkout.stripe.com/session" }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(
      <SubscribeClient
        canceled={false}
        priceLabel="$49/mo"
        success={false}
        sessionId={null}
        currentStatus={null}
      />
    );

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Promo code"), "SAVE10");
    await user.click(screen.getByText("Apply"));

    await waitFor(() => {
      expect(screen.getByText(/10% off applied!/)).toBeTruthy();
    });

    await user.click(screen.getByText(/Subscribe with Stripe/));

    await waitFor(() => {
      const checkoutCall = fetchSpy.mock.calls.find((c: unknown[]) => c[0] === "/api/stripe/checkout");
      expect(checkoutCall).toBeTruthy();
      const body = JSON.parse((checkoutCall![1] as { body: string }).body);
      expect(body.promoCodeId).toBe("promo_1");
    });
  });

  it("shows invalid promo message", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "invalid_code" }),
    });

    render(
      <SubscribeClient
        canceled={false}
        priceLabel="$49/mo"
        success={false}
        sessionId={null}
        currentStatus={null}
      />
    );

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Promo code"), "BAD");
    await user.click(screen.getByText("Apply"));

    await waitFor(() => {
      expect(screen.getByText("Invalid or expired promo code.")).toBeTruthy();
    });
  });

  it("polls and redirects on success=true activation", async () => {
    vi.useFakeTimers();
    let pollCount = 0;
    fetchSpy.mockImplementation(() => {
      pollCount++;
      return Promise.resolve({
        ok: true,
        json: async () => ({
          status: pollCount >= 2 ? "active" : "incomplete",
        }),
      });
    });

    render(
      <SubscribeClient
        canceled={false}
        priceLabel="$49/mo"
        success={true}
        sessionId="cs_test_123"
        currentStatus={null}
      />
    );

    // Advance past first poll (2s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // Advance past second poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(locationHrefSpy).toHaveBeenCalledWith("/dashboard");
  });

  it("shows timeout banner when activation takes too long", async () => {
    vi.useFakeTimers();
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "incomplete" }),
    });

    render(
      <SubscribeClient
        canceled={false}
        priceLabel="$49/mo"
        success={true}
        sessionId="cs_test_123"
        currentStatus={null}
      />
    );

    // Advance in steps past the 30s timeout, allowing promises to settle
    for (let i = 0; i < 17; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
    }

    // After 34s, the component should show the timeout banner
    expect(screen.getByText(/This is taking longer than expected/)).toBeTruthy();
    expect(screen.getByText("Refresh")).toBeTruthy();
  }, 15000);

  it("shows status banner for past_due", () => {
    render(
      <SubscribeClient
        canceled={false}
        priceLabel="$49/mo"
        success={false}
        sessionId={null}
        currentStatus="past_due"
      />
    );

    expect(screen.getByText("Your last payment failed.")).toBeTruthy();
    expect(screen.getByText("Update payment method")).toBeTruthy();
  });
});

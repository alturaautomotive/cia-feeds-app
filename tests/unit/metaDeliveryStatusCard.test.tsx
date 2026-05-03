// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import MetaDeliveryStatusCard from "@/app/dashboard/profile/MetaDeliveryStatusCard";

function makeStatusData(overrides: Record<string, unknown> = {}) {
  return {
    ready: true,
    readiness: {
      tokenPresent: true,
      tokenValid: true,
      catalogSelected: true,
      supportedVertical: true,
      hasInventory: true,
      notBlocked: true,
    },
    inventoryCount: 5,
    vertical: "automotive",
    deliveryMethod: "api",
    queue: null,
    lastRun: null,
    circuit: { blocked: false },
    ...overrides,
  };
}

describe("MetaDeliveryStatusCard", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders readiness checklist with failures", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeStatusData({
        readiness: {
          tokenPresent: true,
          tokenValid: true,
          catalogSelected: false,
          supportedVertical: true,
          hasInventory: false,
          notBlocked: true,
        },
      }),
    });

    render(<MetaDeliveryStatusCard vertical="automotive" onReconnect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Meta Delivery Health")).toBeTruthy();
    });

    // Passing items show checkmark
    expect(screen.getByText(/Meta token present/).parentElement!.textContent).toContain("\u2713");
    // Failing items show X
    expect(screen.getByText(/Catalog selected/).parentElement!.textContent).toContain("\u2717");
    expect(screen.getByText(/Has pushable inventory/).parentElement!.textContent).toContain("\u2717");
    // Inventory hint for automotive
    expect(screen.getByText(/Add at least one vehicle/)).toBeTruthy();
  });

  it("renders circuit-breaker alert and reconnect button", async () => {
    const onReconnect = vi.fn();
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeStatusData({
        circuit: {
          blocked: true,
          reason: "auth_failure: token expired",
          consecutiveAuthFailures: 3,
        },
      }),
    });

    render(<MetaDeliveryStatusCard vertical="automotive" onReconnect={onReconnect} />);

    await waitFor(() => {
      expect(screen.getByText("Meta delivery blocked")).toBeTruthy();
    });

    expect(screen.getByText("Consecutive auth failures: 3")).toBeTruthy();
    expect(screen.getByText("auth_failure: token expired")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByText("Reconnect Meta"));
    expect(onReconnect).toHaveBeenCalled();
  });

  it("polls and stops on unmount", async () => {
    vi.useFakeTimers();
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeStatusData(),
    });

    const { unmount } = render(
      <MetaDeliveryStatusCard vertical="automotive" onReconnect={vi.fn()} />
    );

    // Initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const initialCalls = fetchSpy.mock.calls.length;

    // Advance 60s (2 poll intervals of 30s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    const callsAfterPolling = fetchSpy.mock.calls.length;
    expect(callsAfterPolling).toBeGreaterThan(initialCalls);

    // Unmount and advance more — no new calls
    unmount();
    const callsAtUnmount = fetchSpy.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetchSpy.mock.calls.length).toBe(callsAtUnmount);
  });

  it("renders session expired state on 401", async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

    render(<MetaDeliveryStatusCard vertical="automotive" onReconnect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Your session expired.")).toBeTruthy();
    });
  });

  it("renders dealer not found state on 404", async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

    render(<MetaDeliveryStatusCard vertical="automotive" onReconnect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Dealer account not found.")).toBeTruthy();
    });
  });

  it("renders network error with retry button on fetch throw", async () => {
    fetchSpy.mockRejectedValue(new Error("Network error"));

    render(<MetaDeliveryStatusCard vertical="automotive" onReconnect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Unable to load delivery status.")).toBeTruthy();
    });
    expect(screen.getByText("Retry")).toBeTruthy();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// File-local mocks — NOT in tests/setup.ts
vi.mock("@/lib/stripe", () => ({
  stripeClient: {
    webhooks: { constructEvent: vi.fn() },
    subscriptions: { retrieve: vi.fn() },
  },
}));

vi.mock("@/lib/logger", () => ({
  logStripeWebhookReceived: vi.fn(),
  logStripeWebhookProcessed: vi.fn(),
  logStripeWebhookError: vi.fn(),
}));

import { POST } from "@/app/api/stripe/webhook/route";
import { stripeClient } from "@/lib/stripe";
const { prisma } = await import("@/lib/prisma");

function makeEvent(type: string, dataObject: Record<string, unknown>, id = "evt_test_123") {
  return { id, type, data: { object: dataObject } };
}

function stubConstructEvent(event: ReturnType<typeof makeEvent>) {
  vi.mocked(stripeClient.webhooks.constructEvent).mockReturnValue(event as never);
}

function makeRequest(body = "{}") {
  return new Request("http://localhost:3000/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body,
  });
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing webhook event (not idempotent)
    (prisma.stripeWebhookEvent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.stripeWebhookEvent.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    // Default dealer lookup
    (prisma.dealer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "d-1", metaDeliveryMethod: "api" });
    (prisma.dealer.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it("handles customer.subscription.created", async () => {
    const event = makeEvent("customer.subscription.created", {
      customer: "cus_123",
      status: "active",
      id: "sub_123",
    });
    stubConstructEvent(event);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    expect(prisma.dealer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stripeCustomerId: "cus_123" } })
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("handles customer.subscription.updated", async () => {
    const event = makeEvent("customer.subscription.updated", {
      customer: "cus_123",
      status: "past_due",
      id: "sub_123",
    });
    stubConstructEvent(event);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("handles customer.subscription.deleted with canceled status", async () => {
    const event = makeEvent("customer.subscription.deleted", {
      customer: "cus_123",
      status: "canceled",
      id: "sub_123",
    });
    stubConstructEvent(event);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(prisma.dealer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: "canceled",
          metaDeliveryMethod: "csv",
        }),
      })
    );
  });

  it("handles invoice.payment_failed", async () => {
    const event = makeEvent("invoice.payment_failed", {
      customer: "cus_123",
    });
    stubConstructEvent(event);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(prisma.dealer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subscriptionStatus: "past_due" }),
      })
    );
  });

  it("handles invoice.paid with subscription", async () => {
    vi.mocked(stripeClient.subscriptions.retrieve).mockResolvedValue({
      status: "active",
      id: "sub_456",
    } as never);

    const event = makeEvent("invoice.paid", {
      customer: "cus_123",
      subscription: "sub_456",
    });
    stubConstructEvent(event);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(stripeClient.subscriptions.retrieve).toHaveBeenCalledWith("sub_456");
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("handles invoice.paid without subscription (one-off)", async () => {
    const event = makeEvent("invoice.paid", {
      customer: "cus_123",
      subscription: null,
    });
    stubConstructEvent(event);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(prisma.stripeWebhookEvent.create).toHaveBeenCalled();
    expect(prisma.dealer.update).not.toHaveBeenCalled();
  });

  it("handles customer.subscription.paused", async () => {
    const event = makeEvent("customer.subscription.paused", {
      customer: "cus_123",
      status: "paused",
      id: "sub_123",
    });
    stubConstructEvent(event);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("handles customer.subscription.resumed", async () => {
    const event = makeEvent("customer.subscription.resumed", {
      customer: "cus_123",
      status: "active",
      id: "sub_123",
    });
    stubConstructEvent(event);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("handles customer.subscription.trial_will_end (log-only)", async () => {
    const event = makeEvent("customer.subscription.trial_will_end", {
      customer: "cus_123",
      status: "trialing",
      trial_end: 1700000000,
    });
    stubConstructEvent(event);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    expect(prisma.stripeWebhookEvent.create).toHaveBeenCalled();
    expect(prisma.dealer.update).not.toHaveBeenCalled();
  });

  it("returns idempotent response for duplicate event", async () => {
    (prisma.stripeWebhookEvent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "evt_dup" });
    const event = makeEvent("customer.subscription.created", { customer: "cus_123", status: "active" }, "evt_dup");
    stubConstructEvent(event);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.received).toBe(true);
    expect(body.idempotent).toBe(true);
    expect(prisma.dealer.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 on signature verification failure", async () => {
    vi.mocked(stripeClient.webhooks.constructEvent).mockImplementation(() => {
      throw new Error("sig invalid");
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("verification failed");
  });
});

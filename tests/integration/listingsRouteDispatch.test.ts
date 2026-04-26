import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/impersonation", () => ({
  getEffectiveDealerId: vi.fn(),
}));

vi.mock("@/lib/checkSubscription", () => ({
  checkSubscription: vi.fn(),
}));

vi.mock("@/lib/metaDelivery", () => ({
  dispatchFeedDeliveryInBackground: vi.fn(),
}));

vi.mock("@/lib/serviceUrlValidator", () => ({
  computeCompletenessFromMerged: vi.fn().mockReturnValue({ isComplete: true, missingFields: [] }),
  checkServicesCompleteness: vi.fn().mockReturnValue({ isComplete: true, missingFields: [] }),
  revalidatePublishStatus: vi.fn().mockReturnValue({ publishStatus: "published", downgraded: false }),
  computeIsHighQuality: vi.fn().mockReturnValue(true),
  HIGH_QUALITY_KEY_FIELDS: [],
  SERVICES_COMPLETENESS_FIELDS: [],
}));

vi.mock("@/lib/imageValidator", () => ({
  validateImageUrl: vi.fn().mockResolvedValue({ isCrawlerSafe: true, httpStatus: 200, contentType: "image/jpeg", redirectChain: [], failureReason: null }),
}));

vi.mock("@/lib/logger", () => ({
  logServiceImageValidation: vi.fn(),
}));

const afterCallbacks: (() => Promise<void>)[] = [];
vi.mock("next/server", () => ({
  NextRequest: class NextRequest extends Request {},
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { "content-type": "application/json", ...(init?.headers || {}) },
      }),
  },
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb);
  },
}));

import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { checkSubscription } from "@/lib/checkSubscription";
import { dispatchFeedDeliveryInBackground } from "@/lib/metaDelivery";
import { DELETE, PATCH } from "@/app/api/listings/[id]/route";

const DEALER_ID = "dealer-list-001";
const LISTING_ID = "listing-001";

const LISTING = {
  id: LISTING_ID,
  dealerId: DEALER_ID,
  vertical: "services",
  title: "Test Service",
  price: 100,
  imageUrls: ["https://example.com/img.jpg"],
  url: "https://example.com/service",
  publishStatus: "published",
  urlValidationScore: 0.9,
  canonicalUrl: null,
  isComplete: true,
  missingFields: [],
  archivedAt: null,
  data: { description: "A service" },
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeDeleteRequest() {
  return new Request(`http://localhost:3000/api/listings/${LISTING_ID}`, {
    method: "DELETE",
  }) as Parameters<typeof DELETE>[0];
}

function makePatchRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost:3000/api/listings/${LISTING_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Parameters<typeof PATCH>[0];
}

const paramsPromise = Promise.resolve({ id: LISTING_ID });

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  vi.mocked(getEffectiveDealerId).mockResolvedValue(DEALER_ID);
  vi.mocked(checkSubscription).mockResolvedValue(true);
  vi.mocked(prisma.listing.findFirst).mockResolvedValue(LISTING as never);
  vi.mocked(prisma.listing.update).mockResolvedValue(LISTING as never);
  vi.mocked(prisma.listing.delete).mockResolvedValue(LISTING as never);
  vi.mocked(dispatchFeedDeliveryInBackground).mockImplementation(() => {});
});

describe("DELETE /api/listings/[id] — dispatch", () => {
  it("dispatches once after a successful DELETE", async () => {
    const res = await DELETE(makeDeleteRequest(), { params: paramsPromise });
    expect(res.status).toBe(200);
    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledTimes(1);
    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledWith(
      DEALER_ID,
      "listings/[id]/DELETE",
      expect.any(Function)
    );
  });

  it("does NOT dispatch on unauthorized request", async () => {
    vi.mocked(getEffectiveDealerId).mockResolvedValue(null as never);
    const res = await DELETE(makeDeleteRequest(), { params: paramsPromise });
    expect(res.status).toBe(401);
    expect(dispatchFeedDeliveryInBackground).not.toHaveBeenCalled();
  });

  it("does NOT dispatch when listing is not found", async () => {
    vi.mocked(prisma.listing.findFirst).mockResolvedValue(null as never);
    const res = await DELETE(makeDeleteRequest(), { params: paramsPromise });
    expect(res.status).toBe(404);
    expect(dispatchFeedDeliveryInBackground).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/listings/[id] — dispatch", () => {
  it("dispatches once after a successful PATCH", async () => {
    const res = await PATCH(makePatchRequest({ title: "Updated Service" }), { params: paramsPromise });
    expect(res.status).toBe(200);
    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledTimes(1);
    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledWith(
      DEALER_ID,
      "listings/[id]/PATCH",
      expect.any(Function)
    );
  });

  it("does NOT dispatch on unauthorized request", async () => {
    vi.mocked(getEffectiveDealerId).mockResolvedValue(null as never);
    const res = await PATCH(makePatchRequest({ title: "Updated" }), { params: paramsPromise });
    expect(res.status).toBe(401);
    expect(dispatchFeedDeliveryInBackground).not.toHaveBeenCalled();
  });

  it("does NOT dispatch when listing is not found", async () => {
    vi.mocked(prisma.listing.findFirst).mockResolvedValue(null as never);
    const res = await PATCH(makePatchRequest({ title: "Updated" }), { params: paramsPromise });
    expect(res.status).toBe(404);
    expect(dispatchFeedDeliveryInBackground).not.toHaveBeenCalled();
  });
});

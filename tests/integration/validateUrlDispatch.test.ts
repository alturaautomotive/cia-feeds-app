import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock impersonation
vi.mock("@/lib/impersonation", () => ({
  getEffectiveDealerId: vi.fn(),
}));

// Mock checkSubscription
vi.mock("@/lib/checkSubscription", () => ({
  checkSubscription: vi.fn(),
}));

// Mock firecrawl
vi.mock("@/lib/firecrawl", () => ({
  firecrawlClient: {
    scrape: vi.fn(),
  },
}));

// Mock extraction schema
vi.mock("@/lib/extractionSchema", () => ({
  SERVICES_EXTRACTION_SCHEMA: {},
  SERVICES_EXTRACTION_PROMPT: "test prompt",
}));

// Mock serviceUrlValidator
vi.mock("@/lib/serviceUrlValidator", () => ({
  scoreServiceUrlMatch: vi.fn().mockReturnValue({ score: 85, verdict: "good" }),
  derivePublishStatus: vi.fn().mockReturnValue("ready_to_publish"),
  checkServicesCompleteness: vi.fn().mockReturnValue({ missingFields: [], isComplete: true }),
  computeIsHighQuality: vi.fn().mockReturnValue(true),
}));

// Mock metaDelivery
vi.mock("@/lib/metaDelivery", () => ({
  dispatchFeedDeliveryInBackground: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { checkSubscription } from "@/lib/checkSubscription";
import { firecrawlClient } from "@/lib/firecrawl";
import { dispatchFeedDeliveryInBackground } from "@/lib/metaDelivery";
import { POST } from "@/app/api/listings/[id]/validate-url/route";

const DEALER_ID = "dealer-001";
const LISTING_ID = "listing-001";

function makeRequest() {
  return new Request("http://localhost:3000/api/listings/listing-001/validate-url", {
    method: "POST",
  }) as Parameters<typeof POST>[0];
}

const defaultListing = {
  id: LISTING_ID,
  dealerId: DEALER_ID,
  vertical: "services",
  url: "https://example.com/service",
  title: "Test Service",
  price: 100,
  publishStatus: "draft",
  imageUrls: ["https://example.com/img.jpg"],
  data: { category: "oil_change", brand: "Test", fieldSources: {} },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getEffectiveDealerId).mockResolvedValue(DEALER_ID);
  vi.mocked(checkSubscription).mockResolvedValue(true);
  vi.mocked(prisma.listing.findFirst).mockResolvedValue(defaultListing as never);
  vi.mocked(prisma.listing.update).mockResolvedValue(defaultListing as never);
  vi.mocked(firecrawlClient.scrape).mockResolvedValue({
    json: { title: "Test Service", description: "desc", price: "100" },
  } as never);
});

describe("POST /api/listings/[id]/validate-url — dispatch", () => {
  it("dispatches feed delivery after successful listing update", async () => {
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LISTING_ID }) });
    expect(res.status).toBe(200);

    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledTimes(1);
    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledWith(
      DEALER_ID,
      "listings/[id]/validate-url/POST",
      expect.any(Function)
    );
  });

  it("does not dispatch on unauthorized request", async () => {
    vi.mocked(getEffectiveDealerId).mockResolvedValue(null as never);

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LISTING_ID }) });
    expect(res.status).toBe(401);

    expect(dispatchFeedDeliveryInBackground).not.toHaveBeenCalled();
  });

  it("does not dispatch when listing is not found", async () => {
    vi.mocked(prisma.listing.findFirst).mockResolvedValue(null);

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LISTING_ID }) });
    expect(res.status).toBe(404);

    expect(dispatchFeedDeliveryInBackground).not.toHaveBeenCalled();
  });

  it("does not dispatch when scrape fails", async () => {
    vi.mocked(firecrawlClient.scrape).mockRejectedValue(new Error("scrape failure"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: LISTING_ID }) });
    expect(res.status).toBe(500);

    expect(dispatchFeedDeliveryInBackground).not.toHaveBeenCalled();
  });
});

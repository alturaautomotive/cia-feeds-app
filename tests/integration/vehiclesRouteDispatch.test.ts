import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vehicle: {
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

vi.mock("@/lib/vehicleCompleteness", () => ({
  computeCompleteness: vi.fn().mockReturnValue({ isComplete: true, missingFields: [] }),
}));

const { afterCallbacks, MockNextResponse } = vi.hoisted(() => {
  const afterCallbacks: (() => Promise<void>)[] = [];
  class MockNextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { "content-type": "application/json", ...(init?.headers || {}) },
      });
    }
  }
  return { afterCallbacks, MockNextResponse };
});

vi.mock("next/server", () => ({
  NextRequest: class NextRequest extends Request {},
  NextResponse: MockNextResponse,
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb);
  },
}));

import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { checkSubscription } from "@/lib/checkSubscription";
import { dispatchFeedDeliveryInBackground } from "@/lib/metaDelivery";
import { DELETE, PATCH } from "@/app/api/vehicles/[id]/route";

const DEALER_ID = "dealer-veh-001";
const VEHICLE_ID = "vehicle-001";

const VEHICLE = {
  id: VEHICLE_ID,
  dealerId: DEALER_ID,
  url: "https://example.com/car",
  make: "Honda",
  model: "Civic",
  year: "2022",
  price: 25000,
  stateOfVehicle: "Used",
  imageUrl: "https://example.com/img.jpg",
  images: ["https://example.com/img.jpg"],
  mileageValue: 10000,
  bodyStyle: null,
  exteriorColor: null,
  trim: null,
  drivetrain: null,
  transmission: null,
  fuelType: null,
  msrp: null,
  vin: null,
  description: null,
  address: null,
  latitude: null,
  longitude: null,
  isComplete: true,
  missingFields: [],
};

function makeDeleteRequest() {
  return new Request(`http://localhost:3000/api/vehicles/${VEHICLE_ID}`, {
    method: "DELETE",
  }) as Parameters<typeof DELETE>[0];
}

function makePatchRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost:3000/api/vehicles/${VEHICLE_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Parameters<typeof PATCH>[0];
}

const paramsPromise = Promise.resolve({ id: VEHICLE_ID });

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  vi.mocked(getEffectiveDealerId).mockResolvedValue(DEALER_ID);
  vi.mocked(checkSubscription).mockResolvedValue(true);
  vi.mocked(prisma.vehicle.findFirst).mockResolvedValue(VEHICLE as never);
  vi.mocked(prisma.vehicle.update).mockResolvedValue(VEHICLE as never);
  vi.mocked(prisma.vehicle.delete).mockResolvedValue(VEHICLE as never);
  vi.mocked(dispatchFeedDeliveryInBackground).mockImplementation(() => {});
});

describe("DELETE /api/vehicles/[id] — dispatch", () => {
  it("dispatches once after a successful DELETE", async () => {
    const res = await DELETE(makeDeleteRequest(), { params: paramsPromise });
    expect(res.status).toBe(204);
    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledTimes(1);
    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledWith(
      DEALER_ID,
      "vehicles/[id]/DELETE",
      expect.any(Function)
    );
  });

  it("does NOT dispatch on unauthorized request", async () => {
    vi.mocked(getEffectiveDealerId).mockResolvedValue(null as never);
    const res = await DELETE(makeDeleteRequest(), { params: paramsPromise });
    expect(res.status).toBe(401);
    expect(dispatchFeedDeliveryInBackground).not.toHaveBeenCalled();
  });

  it("does NOT dispatch when vehicle is not found", async () => {
    vi.mocked(prisma.vehicle.findFirst).mockResolvedValue(null as never);
    const res = await DELETE(makeDeleteRequest(), { params: paramsPromise });
    expect(res.status).toBe(404);
    expect(dispatchFeedDeliveryInBackground).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/vehicles/[id] — dispatch", () => {
  it("dispatches once after a successful PATCH", async () => {
    const res = await PATCH(makePatchRequest({ make: "Toyota" }), { params: paramsPromise });
    expect(res.status).toBe(200);
    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledTimes(1);
    expect(dispatchFeedDeliveryInBackground).toHaveBeenCalledWith(
      DEALER_ID,
      "vehicles/[id]/PATCH",
      expect.any(Function)
    );
  });

  it("does NOT dispatch on unauthorized request", async () => {
    vi.mocked(getEffectiveDealerId).mockResolvedValue(null as never);
    const res = await PATCH(makePatchRequest({ make: "Toyota" }), { params: paramsPromise });
    expect(res.status).toBe(401);
    expect(dispatchFeedDeliveryInBackground).not.toHaveBeenCalled();
  });

  it("does NOT dispatch when vehicle is not found", async () => {
    vi.mocked(prisma.vehicle.findFirst).mockResolvedValue(null as never);
    const res = await PATCH(makePatchRequest({ make: "Toyota" }), { params: paramsPromise });
    expect(res.status).toBe(404);
    expect(dispatchFeedDeliveryInBackground).not.toHaveBeenCalled();
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { VehiclesTable } from "@/app/dashboard/components/VehiclesTable";

function makeVehicle(overrides: Record<string, unknown> = {}) {
  return {
    id: "v-1",
    dealerId: "d-1",
    url: "https://example.com/car",
    vin: "VIN123",
    make: "Honda",
    model: "Civic",
    year: 2022,
    bodyStyle: "Sedan",
    price: 25000,
    mileageValue: 15000,
    stateOfVehicle: "Used",
    exteriorColor: "White",
    imageUrl: "https://example.com/img.jpg",
    description: "A car",
    isComplete: true,
    missingFields: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    scrapeStatus: "complete",
    urlStatus: "active",
    urlLastCheckedAt: null,
    urlCheckFailed: false,
    subAccountId: null,
    address: null,
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

describe("VehiclesTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows Scraping text and dashes for pending row", () => {
    const vehicles = [makeVehicle({ id: "v-p", scrapeStatus: "pending", year: null, make: null, price: null })];
    render(<VehiclesTable vehicles={vehicles as never} />);

    expect(screen.getByText("Scraping…")).toBeTruthy();
    // Pending rows show dashes for year/make/price
    const cells = screen.getAllByText("—");
    expect(cells.length).toBeGreaterThanOrEqual(4);
  });

  it("shows Complete badge with formatted price for complete row", () => {
    const vehicles = [makeVehicle({ id: "v-c", scrapeStatus: "complete", isComplete: true, price: 25000, mileageValue: 15000 })];
    render(<VehiclesTable vehicles={vehicles as never} />);

    expect(screen.getByText("Complete")).toBeTruthy();
    expect(screen.getByText("$25,000")).toBeTruthy();
    expect(screen.getByText("15,000")).toBeTruthy();
  });

  it("shows Failed badge for failed row", () => {
    const vehicles = [makeVehicle({ id: "v-f", scrapeStatus: "failed" })];
    render(<VehiclesTable vehicles={vehicles as never} />);

    expect(screen.getByText("Failed")).toBeTruthy();
  });

  it("shows Live badge for active urlStatus", () => {
    const vehicles = [makeVehicle({ id: "v-a", urlStatus: "active" })];
    render(<VehiclesTable vehicles={vehicles as never} />);

    expect(screen.getByText("Live")).toBeTruthy();
  });

  it("shows Sold / Removed badge for sold_or_removed urlStatus", () => {
    const vehicles = [makeVehicle({ id: "v-s", urlStatus: "sold_or_removed" })];
    render(<VehiclesTable vehicles={vehicles as never} />);

    expect(screen.getByText("Sold / Removed")).toBeTruthy();
  });

  it("applies line-through class for urlCheckFailed row", () => {
    const vehicles = [makeVehicle({ id: "v-lt", urlCheckFailed: true })];
    const { container } = render(<VehiclesTable vehicles={vehicles as never} />);

    const row = container.querySelector('tr[data-element-id="vehicle-row-v-lt"]');
    expect(row).toBeTruthy();
    expect(row!.className).toContain("line-through");
  });

  it("navigates on click for complete row but not for pending row", async () => {
    const vehicles = [
      makeVehicle({ id: "v-nav", scrapeStatus: "complete" }),
      makeVehicle({ id: "v-pend", scrapeStatus: "pending" }),
    ];
    const { container } = render(<VehiclesTable vehicles={vehicles as never} />);
    const user = userEvent.setup();

    const completeRow = container.querySelector('tr[data-element-id="vehicle-row-v-nav"]')!;
    await user.click(completeRow);
    expect(mockPush).toHaveBeenCalledWith("/dashboard/vehicles/v-nav");

    mockPush.mockClear();
    const pendingRow = container.querySelector('tr[data-element-id="vehicle-row-v-pend"]')!;
    await user.click(pendingRow);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

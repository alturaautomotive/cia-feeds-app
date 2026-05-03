// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ListingsTable } from "@/app/dashboard/components/ListingsTable";

function makeListing(overrides: Record<string, unknown> = {}) {
  return {
    id: "list-1",
    title: "Test Listing",
    price: 100,
    imageUrls: [],
    url: "https://example.com",
    isComplete: true,
    missingFields: [],
    data: {},
    createdAt: new Date().toISOString(),
    publishStatus: "ready_to_publish",
    urlValidationScore: null,
    ...overrides,
  };
}

describe("ListingsTable", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders vertical-specific headers for services", () => {
    render(
      <ListingsTable
        listings={[makeListing()]}
        vertical="services"
      />
    );
    expect(screen.getByText("Category")).toBeTruthy();
    expect(screen.getByText("Brand")).toBeTruthy();
    expect(screen.getByText("Location")).toBeTruthy();
  });

  it("renders vertical-specific headers for ecommerce", () => {
    render(
      <ListingsTable
        listings={[makeListing()]}
        vertical="ecommerce"
      />
    );
    expect(screen.getByText("Condition")).toBeTruthy();
    expect(screen.getByText("Brand")).toBeTruthy();
  });

  it("calls fetch with DELETE on delete action", async () => {
    const onDelete = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <ListingsTable
        listings={[makeListing({ id: "del-1" })]}
        vertical="ecommerce"
        onDelete={onDelete}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/listings/del-1", { method: "DELETE" });
    });
    expect(onDelete).toHaveBeenCalled();
  });

  it("calls fetch with PATCH publishStatus on publish action", async () => {
    const onDelete = vi.fn();

    render(
      <ListingsTable
        listings={[makeListing({ id: "pub-1", publishStatus: "ready_to_publish" })]}
        vertical="services"
        onDelete={onDelete}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByText("Publish"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/listings/pub-1",
        expect.objectContaining({ method: "PATCH" })
      );
    });

    const patchCall = fetchSpy.mock.calls.find(
      (c: unknown[]) => c[0] === "/api/listings/pub-1" && (c[1] as { method: string }).method === "PATCH"
    );
    const body = JSON.parse((patchCall![1] as { body: string }).body);
    expect(body.publishStatus).toBe("published");
  });

  it("shows error banner when publish fails", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: "missing_fields" }),
    });

    render(
      <ListingsTable
        listings={[makeListing({ id: "pub-err", publishStatus: "ready_to_publish" })]}
        vertical="services"
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByText("Publish"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.getByText(/missing_fields/)).toBeTruthy();
  });

  it("edit/save flow calls PATCH and triggers onDelete", async () => {
    const onDelete = vi.fn();
    const listing = makeListing({
      id: "edit-1",
      data: { name: "Orig", description: "desc" },
    });

    render(
      <ListingsTable
        listings={[listing]}
        vertical="services"
        onDelete={onDelete}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByText("Edit"));

    // The edit form should now be visible
    await waitFor(() => {
      expect(screen.getByText("Save")).toBeTruthy();
    });

    await user.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/listings/edit-1",
        expect.objectContaining({ method: "PATCH" })
      );
    });
    expect(onDelete).toHaveBeenCalled();
  });
});

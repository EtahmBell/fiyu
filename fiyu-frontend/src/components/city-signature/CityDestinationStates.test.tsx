// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ListsPage from "@/app/(application)/lists/page";
import LogPage from "@/app/(application)/log/page";

const defaultList = vi.hoisted(() => ({
  state: {
    cityId: "tokyo",
    status: "ready",
    list: {
      list_id: 1,
      city_id: "tokyo",
      name: "Tokyo",
      list_kind: "default",
      item_count: 0,
      items: [],
      created_at: "now",
      updated_at: "now",
    },
    savedPlaceIds: [],
    pendingPlaceIds: [],
    error: null,
    operationError: null,
  },
}));

vi.mock("@/lib/lists/useDefaultList", () => ({
  useDefaultList: () => ({
    ...defaultList.state,
    ensureLoaded: vi.fn(),
    retry: vi.fn(),
    toggle: vi.fn(),
    isSaved: () => false,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  defaultList.state = {
    cityId: "tokyo",
    status: "ready",
    list: {
      list_id: 1,
      city_id: "tokyo",
      name: "Tokyo",
      list_kind: "default",
      item_count: 0,
      items: [],
      created_at: "now",
      updated_at: "now",
    },
    savedPlaceIds: [],
    pendingPlaceIds: [],
    error: null,
    operationError: null,
  };
});

describe("Tokyo destination empty states", () => {
  it("renders the simplified Tokyo list empty state without custom-list panels", () => {
    const { container } = render(<ListsPage />);

    expect(screen.getByRole("heading", { name: "Your Tokyo list" })).toBeTruthy();
    expect(screen.getByText("Restaurants you save in Tokyo appear here.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "No saved places yet" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Explore today's Picks" }).getAttribute("href"),
    ).toBe("/picks");
    expect(screen.queryByText("No custom lists yet")).toBeNull();
    expect(container.querySelector("[data-city-empty-state='saved']")).toBeNull();
    expect(container.querySelector("[data-city-empty-state='lists']")).toBeNull();
    expect(container.textContent).not.toContain("List creation is not available");
  });

  it("uses the visits variant without fabricating a logging action", () => {
    const { container } = render(<LogPage />);
    const visits = container.querySelector('[data-city-empty-state="visits"]') as HTMLElement;

    expect(screen.getByText("No visits logged")).toBeTruthy();
    expect(within(visits).queryByRole("link")).toBeNull();
    expect(within(visits).queryByRole("button")).toBeNull();
  });
});

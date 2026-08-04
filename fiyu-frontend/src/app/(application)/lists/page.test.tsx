// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ListsPage from "@/app/(application)/lists/page";
import type { DefaultListResponse } from "@/lib/api/schemas";

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
  } as {
    cityId: string;
    status: "idle" | "loading" | "ready" | "error";
    list: DefaultListResponse;
    savedPlaceIds: string[];
    pendingPlaceIds: string[];
    error: { detail?: string } | null;
    operationError: string | null;
  },
  retry: vi.fn(),
  toggle: vi.fn(),
}));

const smartApi = vi.hoisted(() => ({
  fetchRestaurants: vi.fn(),
  fetchDefaultListSmartViews: vi.fn(),
  fetchDefaultListSmartView: vi.fn(),
}));

vi.mock("@/lib/lists/useDefaultList", () => ({
  useDefaultList: () => ({
    ...defaultList.state,
    ensureLoaded: vi.fn(),
    retry: defaultList.retry,
    toggle: defaultList.toggle,
    isSaved: (placeId: string) => defaultList.state.savedPlaceIds.includes(placeId),
  }),
}));

vi.mock("@/lib/api/client", () => ({
  fetchRestaurants: smartApi.fetchRestaurants,
  fetchDefaultListSmartViews: smartApi.fetchDefaultListSmartViews,
  fetchDefaultListSmartView: smartApi.fetchDefaultListSmartView,
}));

vi.mock("@/components/restaurant/RestaurantPhoto", () => ({
  RestaurantPhoto: ({ restaurantName }: { restaurantName: string }) => (
    <div data-testid="mock-photo">{restaurantName}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  defaultList.retry.mockReset();
  defaultList.toggle.mockReset();
  smartApi.fetchRestaurants.mockReset();
  smartApi.fetchDefaultListSmartViews.mockReset();
  smartApi.fetchDefaultListSmartView.mockReset();
  smartApi.fetchRestaurants.mockResolvedValue({ restaurants: [], rejected: [] });
  smartApi.fetchDefaultListSmartViews.mockResolvedValue({
    city_id: "tokyo",
    generated_at: "now",
    views: [
      { key: "recently_saved", label: "Recently saved", description: "desc", item_count: 2 },
      { key: "fiyu_9_plus", label: "Fiyu 9+", description: "desc", item_count: 1 },
      { key: "not_visited", label: "Not visited", description: "desc", item_count: 2 },
      { key: "by_neighborhood", label: "By neighborhood", description: "desc", item_count: 2 },
      { key: "nearby", label: "Nearby", description: "desc", item_count: 2 },
    ],
  });
  smartApi.fetchDefaultListSmartView.mockResolvedValue({
    city_id: "tokyo",
    view_key: "recently_saved",
    label: "Recently saved",
    description: "desc",
    item_count: 1,
    items: [
      {
        place_id: "one",
        added_at: "2026-08-03T00:00:00Z",
        is_visited: false,
        distance_km: null,
        restaurant: {
          place_id: "one",
          name_ja: "店一",
          name_en: "Shop One",
          primary_category: "sushi",
          neighborhood: "Asakusa",
          fiyu_score: 90,
          score_band: "excellent",
        },
      },
    ],
    groups: [],
    generated_at: "now",
  });
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

describe("lists page", () => {
  it("renders the simple empty state for an empty Tokyo list", () => {
    render(<ListsPage />);

    expect(screen.getByRole("heading", { name: "Your Tokyo list" })).toBeTruthy();
    expect(screen.getByText("Restaurants you save in Tokyo appear here.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "No saved places yet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Explore today’s Picks" }).getAttribute("href")).toBe(
      "/picks",
    );
    expect(screen.queryByText("No custom lists yet")).toBeNull();
    expect(screen.queryByText("List creation is not available")).toBeNull();
    expect(document.body.textContent).not.toContain("shoji");
    expect(document.body.textContent).not.toContain("noren");
  });

  it("renders Smart heading immediately when tab=smart is requested", async () => {
    render(<ListsPage searchParams={{ tab: "smart" }} />);

    expect(await screen.findByRole("heading", { name: "Smart views" })).toBeTruthy();
    expect(
      screen.getByText("Your saved places, reorganized for different ways of exploring Tokyo."),
    ).toBeTruthy();
  });

  it("renders saved restaurants newest first", () => {
    defaultList.state.list = {
      ...defaultList.state.list,
      item_count: 2,
      items: [
        {
          place_id: "older",
          added_at: "2026-08-03T08:00:00Z",
          restaurant: {
            place_id: "older",
            name_ja: "古い",
            name_en: "Older",
            primary_category: "Sushi",
            neighborhood: "Asakusa",
            fiyu_score: 80,
            score_band: "strong",
          },
        },
        {
          place_id: "newer",
          added_at: "2026-08-03T09:00:00Z",
          restaurant: {
            place_id: "newer",
            name_ja: "新しい",
            name_en: "Newer",
            primary_category: "Ramen",
            neighborhood: "Ueno",
            fiyu_score: 88,
            score_band: "excellent",
          },
        },
      ],
    };

    render(<ListsPage />);

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings[0].textContent).toBe("新しい");
    expect(headings[1].textContent).toBe("古い");
  });

  it("shows a saved-place count only once the list has loaded", () => {
    defaultList.state.list = {
      ...defaultList.state.list,
      item_count: 1,
      items: [
        {
          place_id: "only",
          added_at: "2026-08-03T08:00:00Z",
          restaurant: {
            place_id: "only",
            name_ja: "只",
            name_en: "Only",
            primary_category: "sushi",
            neighborhood: "Asakusa",
            fiyu_score: 80,
            score_band: "strong",
          },
        },
      ],
    };

    render(<ListsPage />);

    expect(screen.getByText("1 saved place")).toBeTruthy();
    // Presentation-only title casing, straight from the stored tag value.
    expect(screen.getByText("Sushi")).toBeTruthy();
    expect(screen.queryByText("Asakusa")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove restaurant from saved" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View restaurant" })).toBeTruthy();
  });

  it("shows skeleton rows while loading rather than the empty state", () => {
    defaultList.state.status = "loading";

    render(<ListsPage />);

    expect(screen.queryByRole("heading", { name: "No saved places yet" })).toBeNull();
    expect(screen.getByRole("status", { name: "Loading your Tokyo list" })).toBeTruthy();
    expect(screen.queryByText(/^\d+ saved places?$/)).toBeNull();
  });

  it("shows API failure distinctly from empty state and supports retry", () => {
    defaultList.state.status = "error";
    defaultList.state.error = { detail: "Backend unavailable" };

    render(<ListsPage />);

    expect(
      screen.getByRole("heading", { name: "We couldn’t load your Tokyo list." }),
    ).toBeTruthy();
    expect(screen.getByText("Try again in a moment.")).toBeTruthy();
    // Internal failure detail stays out of the reader-facing page.
    expect(document.body.textContent).not.toContain("Backend unavailable");
    expect(screen.queryByRole("heading", { name: "No saved places yet" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(defaultList.retry).toHaveBeenCalledOnce();
  });

  it("hydrates without warning", async () => {
    const element = <ListsPage />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);

    const messages: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      messages.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "warn").mockImplementation((...args) => {
      messages.push(args.map(String).join(" "));
    });

    await act(async () => {
      hydrateRoot(container, element);
    });

    expect(messages).toEqual([]);
  });

  it("loads Smart Views as card links with Smart heading copy", async () => {
    render(<ListsPage />);

    fireEvent.click(screen.getAllByRole("tab", { name: "Smart" })[0]);

    expect(await screen.findByRole("heading", { name: "Smart views" })).toBeTruthy();
    expect(
      screen.getByText("Your saved places, reorganized for different ways of exploring Tokyo."),
    ).toBeTruthy();

    expect(await screen.findByText("Recently saved")).toBeTruthy();
    expect(await screen.findByText("Fiyu 9+")).toBeTruthy();
    expect(await screen.findByText("Not visited")).toBeTruthy();
    expect(await screen.findByText("By neighbourhood")).toBeTruthy();
    expect(await screen.findByText("Nearby")).toBeTruthy();

    expect(screen.getByRole("link", { name: /Recently saved/i }).getAttribute("href")).toBe(
      "/lists/smart/recently_saved",
    );
    expect(screen.getAllByText("2 places →").length).toBeGreaterThan(0);
    expect(screen.getByText("1 place →")).toBeTruthy();
  });
});

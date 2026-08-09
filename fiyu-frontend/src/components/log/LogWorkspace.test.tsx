// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LogWorkspace } from "@/components/log/LogWorkspace";
import type { RestaurantVisit } from "@/lib/api/schemas";
import {
  createRestaurantVisit,
  deleteRestaurantVisit,
  fetchRestaurantLog,
  fetchRestaurant,
  fetchSeenRestaurantIds,
  updateRestaurantVisit,
} from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({
  createRestaurantVisit: vi.fn(),
  deleteRestaurantVisit: vi.fn(),
  fetchRestaurantLog: vi.fn(),
  fetchRestaurant: vi.fn(),
  fetchSeenRestaurantIds: vi.fn(),
  updateRestaurantVisit: vi.fn(),
}));

vi.mock("@/lib/lists/identity", () => ({
  getOrCreateAnonymousOwnerKey: () => "11111111-1111-4111-8111-111111111111",
}));

vi.mock("@/components/restaurant/RestaurantPhoto", () => ({
  RestaurantPhoto: ({ restaurantName }: { restaurantName: string }) => (
    <div data-testid="restaurant-photo">{restaurantName}</div>
  ),
}));

const catalogRestaurant = {
  place_id: "tokyo-a",
  name_ja: "東京鮨",
  name_en: "Tokyo Sushi",
  category: "sushi",
  description_en: null,
  latitude: 35,
  longitude: 139,
  neighborhood: "Asakusa",
  fiyu_score: 91,
  score_band: "excellent",
  score_type: "editorial_research",
  food_tags: [],
  signature_dishes: [],
  discovery_area: null,
  discovery_area_type: null,
  discovery_areas: [],
  multiple_discovery_areas: false,
  discovery_area_conflict: false,
  location_precision: null,
  verified_core_address: null,
  core_address_verified: false,
  full_address_verified: false,
  map_location_approximate: false,
  map_display_eligible: false,
  map_anchor_type: null,
  map_anchor_id: null,
  location_status: null,
  location_label: null,
  matched_components: {},
  unmatched_components: {},
  provenance: {
    attribution: null,
    osm_type: null,
    osm_id: null,
    osm_version: null,
    osm_timestamp: null,
    representative_point_method: null,
  },
  source_reference: null,
  distance_sort_eligible: false,
  directions_coordinates_eligible: false,
  external_map_search_query: null,
  community_recommendation_count: 0,
  community_positive_count: 0,
  community_recommendation_rate: null,
  community_stats_visible: false,
  restaurant_type_en: null,
  cuisine_terms_en: [],
  signature_dishes_en: [],
  supporting_source_urls: [],
  researched_at: null,
};

let desktopViewport = true;

function seedSeenRestaurants(placeIds: string[]) {
  vi.mocked(fetchSeenRestaurantIds).mockResolvedValue(placeIds);
}

function visit(overrides: Partial<RestaurantVisit> = {}): RestaurantVisit {
  return {
    id: "visit-a",
    place_id: "tokyo-a",
    visited_at: "2026-08-08T12:00:00+00:00",
    reaction: "like_it",
    private_note: "Counter seat near the chef.",
    created_at: "2026-08-08T12:00:00+00:00",
    updated_at: "2026-08-08T12:00:00+00:00",
    restaurant: {
      place_id: "tokyo-a",
      name_ja: "東京鮨",
      name_en: "Tokyo Sushi",
      primary_category: "sushi",
      neighborhood: "Asakusa",
      fiyu_score: 91,
      score_band: "excellent",
    },
    ...overrides,
  };
}

beforeEach(() => {
  desktopViewport = true;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: desktopViewport,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  window.localStorage.clear();
  vi.mocked(fetchRestaurantLog).mockReset();
  vi.mocked(fetchRestaurant).mockReset();
  vi.mocked(fetchSeenRestaurantIds).mockReset();
  vi.mocked(createRestaurantVisit).mockReset();
  vi.mocked(updateRestaurantVisit).mockReset();
  vi.mocked(deleteRestaurantVisit).mockReset();
  seedSeenRestaurants(["tokyo-a"]);
  vi.mocked(fetchRestaurant).mockResolvedValue(catalogRestaurant);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LogWorkspace", () => {
  it("shows loading without fake visits, then the full-width empty state", async () => {
    let resolveLog: ((value: RestaurantVisit[]) => void) | undefined;
    vi.mocked(fetchRestaurantLog).mockReturnValue(
      new Promise((resolve) => {
        resolveLog = resolve;
      }),
    );

    render(<LogWorkspace />);

    expect(screen.getByRole("status", { name: "Loading your Log" })).toBeTruthy();
    expect(screen.queryByText("Tokyo Sushi")).toBeNull();
    resolveLog?.([]);

    expect(await screen.findByText("No visits logged yet")).toBeTruthy();
    expect(screen.getByText("Keep a private record of the restaurants you discover.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Log your first visit/ })).toBeTruthy();
  });

  it("creates a visit from the published restaurant selector", async () => {
    seedSeenRestaurants(["tokyo-a"]);
    vi.mocked(fetchRestaurantLog).mockResolvedValue([]);
    vi.mocked(createRestaurantVisit).mockResolvedValue(visit());
    render(<LogWorkspace />);

    fireEvent.click(await screen.findByRole("button", { name: /Log your first visit/ }));
    const dialog = await screen.findByRole("dialog", { name: "Log a visit" });
    const restaurant = await within(dialog).findByRole("combobox", { name: "Restaurant" });
    expect(restaurant.getAttribute("placeholder")).toBe("Search places you've seen");
    expect((restaurant as HTMLInputElement).value).toBe("");
    fireEvent.focus(restaurant);
    expect(await within(dialog).findByText("Recently seen")).toBeTruthy();
    expect(fetchRestaurant).toHaveBeenCalledWith("tokyo-a");
    expect(fetchRestaurant).not.toHaveBeenCalledWith("tokyo-concealed");
    fireEvent.change(restaurant, { target: { value: "Tokyo Sushi" } });
    expect(await within(dialog).findByRole("option", { name: /Tokyo Sushi/ })).toBeTruthy();
    fireEvent.keyDown(restaurant, { key: "Enter" });
    fireEvent.change(within(dialog).getByLabelText(/Private note/), {
      target: { value: "  Counter seat near the chef.  " },
    });
    fireEvent.change(within(dialog).getByLabelText("Visit date"), {
      target: { value: "2026-08-08" },
    });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Love it" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save visit" }));

    await waitFor(() => {
      expect(createRestaurantVisit).toHaveBeenCalledWith(
        {
          place_id: "tokyo-a",
          visited_at: "2026-08-08T12:00:00.000Z",
          reaction: "love_it",
          private_note: "Counter seat near the chef.",
        },
        { clientId: "11111111-1111-4111-8111-111111111111" },
      );
    });
    expect(await screen.findByRole("heading", { name: "東京鮨" })).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Restaurant visits" })).getByText(
        "Counter seat near the chef.",
      ),
    ).toBeTruthy();
  });

  it("limits bilingual search results and supports arrow-key selection", async () => {
    vi.mocked(fetchRestaurantLog).mockResolvedValue([]);
    const seenRestaurants = Array.from({ length: 10 }, (_, index) => ({
        ...catalogRestaurant,
        place_id: `tokyo-${index}`,
        name_ja: `\u5bff\u53f8${index}`,
        name_en: `Sushi ${index}`,
      }));
    seedSeenRestaurants(seenRestaurants.map((restaurant) => restaurant.place_id));
    vi.mocked(fetchRestaurant).mockImplementation(async (placeId) => {
      const restaurant = seenRestaurants.find((candidate) => candidate.place_id === placeId);
      if (!restaurant) throw new Error("Unknown seen restaurant");
      return restaurant;
    });
    render(<LogWorkspace />);

    fireEvent.click(await screen.findByRole("button", { name: /Log your first visit/ }));
    const restaurant = await screen.findByRole("combobox", { name: "Restaurant" });
    fireEvent.change(restaurant, { target: { value: "\u5bff\u53f8" } });

    expect(await screen.findAllByRole("option")).toHaveLength(7);
    fireEvent.keyDown(restaurant, { key: "ArrowDown" });
    fireEvent.keyDown(restaurant, { key: "Enter" });
    expect((restaurant as HTMLInputElement).value).toContain("Sushi 0");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(fetchRestaurant).toHaveBeenCalledTimes(10);
  });

  it("opens directly to the form on mobile and keeps save confirmation in the Log flow", async () => {
    desktopViewport = false;
    vi.mocked(fetchRestaurantLog).mockResolvedValue([]);
    vi.mocked(createRestaurantVisit).mockResolvedValue(
      visit({ restaurant: { ...visit().restaurant, name_ja: null } }),
    );
    render(<LogWorkspace />);

    expect(await screen.findByText("Tokyo edition")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Log a visit" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("link", { name: "History" }).getAttribute("href")).toBe(
      "/log/history",
    );
    expect(screen.queryByText("No visits logged yet")).toBeNull();

    const restaurant = await screen.findByRole("combobox", { name: "Restaurant" });
    fireEvent.change(restaurant, { target: { value: "Tokyo Sushi" } });
    fireEvent.keyDown(restaurant, { key: "Enter" });
    fireEvent.click(screen.getByRole("radio", { name: "Like it" }));
    fireEvent.click(screen.getByRole("button", { name: "Save visit" }));

    expect(await screen.findByText("Visit saved.")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Restaurant" }) as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("link", { name: "View in history" }).getAttribute("href")).toBe(
      "/log/history",
    );
  });

  it("renders mobile history as a normal page view with route-based back navigation", async () => {
    desktopViewport = false;
    vi.mocked(fetchRestaurantLog).mockResolvedValue([visit()]);

    render(<LogWorkspace mobileMode="history" />);

    expect(await screen.findByRole("heading", { name: "History" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Tokyo Sushi")).toBeTruthy();
    expect(screen.getByText("Like it")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Log a visit" }).getAttribute("href")).toBe(
      "/log",
    );
  });

  it("requires a restaurant and exactly one reaction before saving", async () => {
    desktopViewport = false;
    vi.mocked(fetchRestaurantLog).mockResolvedValue([]);
    render(<LogWorkspace />);

    fireEvent.click(await screen.findByRole("button", { name: "Save visit" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "Choose a restaurant and how it was.",
    );
    expect(createRestaurantVisit).not.toHaveBeenCalled();

    const loveIt = screen.getByRole("radio", { name: "Love it" });
    const likeIt = screen.getByRole("radio", { name: "Like it" });
    fireEvent.click(loveIt);
    expect(loveIt.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(likeIt);
    expect(loveIt.getAttribute("aria-checked")).toBe("false");
    expect(likeIt.getAttribute("aria-checked")).toBe("true");
  });

  it("renders separate visits newest-first and supports edit and delete", async () => {
    const older = visit({ id: "older", visited_at: "2026-08-01T12:00:00+00:00" });
    const newer = visit({
      id: "newer",
      place_id: "tokyo-b",
      visited_at: "2026-08-09T12:00:00+00:00",
      private_note: null,
      restaurant: {
        ...visit().restaurant,
        place_id: "tokyo-b",
        name_ja: "上野麺",
        name_en: "Ueno Noodles",
      },
    });
    vi.mocked(fetchRestaurantLog).mockResolvedValue([older, newer]);
    vi.mocked(updateRestaurantVisit).mockResolvedValue({
      ...newer,
      private_note: "Late lunch.",
    });
    vi.mocked(deleteRestaurantVisit).mockResolvedValue({ deleted: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<LogWorkspace />);

    const entries = await screen.findAllByRole("listitem");
    expect(within(entries[0]).getByRole("heading", { name: "上野麺" })).toBeTruthy();
    expect(within(entries[1]).getByRole("heading", { name: "東京鮨" })).toBeTruthy();

    fireEvent.click(within(entries[0]).getByRole("button", { name: "Edit" }));
    const editDialog = screen.getByRole("dialog", { name: "Edit visit" });
    fireEvent.change(within(editDialog).getByLabelText(/Private note/), {
      target: { value: "Late lunch." },
    });
    fireEvent.click(within(editDialog).getByRole("button", { name: "Save visit" }));
    expect(await screen.findByText("Late lunch.")).toBeTruthy();
    expect(updateRestaurantVisit).toHaveBeenCalledWith(
      "newer",
      expect.objectContaining({ private_note: "Late lunch." }),
      { clientId: "11111111-1111-4111-8111-111111111111" },
    );

    const updatedEntries = screen.getAllByRole("listitem");
    fireEvent.click(within(updatedEntries[0]).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteRestaurantVisit).toHaveBeenCalled());
    expect(screen.queryByText("上野麺")).toBeNull();
    expect(screen.getByRole("heading", { name: "東京鮨" })).toBeTruthy();
  });

  it("shows a retryable load error", async () => {
    vi.mocked(fetchRestaurantLog).mockRejectedValue(new Error("offline"));
    render(<LogWorkspace />);

    expect((await screen.findByRole("alert")).textContent).toContain("We couldn’t load your Log.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});

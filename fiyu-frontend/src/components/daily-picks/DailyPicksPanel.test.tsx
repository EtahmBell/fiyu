// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DailyPicksPanel } from "@/components/daily-picks/DailyPicksPanel";
import { mapRestaurantSchema, publicRestaurantSchema, type PublicRestaurant } from "@/lib/api/schemas";
import { RECENT_DISCOVERY_DURATION_MS } from "@/lib/daily-picks/history";
import { createDailyPicksStorage, createDailySelection } from "@/lib/daily-picks/storage";
import { subscribeToNewlyRevealedMapPlaces } from "@/lib/map/revealEvents";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function restaurant(placeId: string, category: string, score: number): PublicRestaurant {
  return publicRestaurantSchema.parse({
    place_id: placeId,
    name_ja: `店 ${placeId}`,
    name_en: `Restaurant ${placeId}`,
    description_en: `Editorial description ${placeId}`,
    category,
    fiyu_score: score,
    food_tags: [category],
    discovery_area: "Shibuya",
  });
}

const catalog = [
  restaurant("one", "Sushi", 91),
  restaurant("two", "Ramen", 89),
  restaurant("three", "Yakitori", 87),
  restaurant("four", "Tempura", 85),
  restaurant("five", "Izakaya", 83),
  restaurant("six", "Yakiniku", 81),
];

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("Today’s Fiyu Picks panel", () => {
  it("uses one primary heading and quiet pre-generation metadata without a location placeholder", () => {
    const storage = createDailyPicksStorage(window.localStorage);

    render(<DailyPicksPanel restaurants={catalog} storage={storage} />);

    expect(screen.getByRole("heading", { level: 1, name: "Today’s Fiyu Picks" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Picks" })).toBeNull();
    expect(screen.getByTestId("daily-picks-pre-generation-meta").textContent).toBe("3 PicksDaily");
    expect(screen.queryByTestId("picks-location-context")).toBeNull();
    expect(document.body.textContent).not.toContain("undefined");
  });

  it("replaces only a visited active Pick with the compact brass state", () => {
    const now = Date.UTC(2026, 6, 29, 12);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const storage = createDailyPicksStorage(window.localStorage);
    storage.save({
      version: 3,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection: {
        ...createDailySelection(["one", "two", "three"], now),
        revealedIds: ["one", "two", "three"],
      },
      discoveries: [],
      savedRestaurantIds: [],
    });
    const visited = mapRestaurantSchema.parse({ ...catalog[0], is_visited: true, user_rating: 4 });

    const view = render(<DailyPicksPanel restaurants={catalog} storage={storage} />);
    expect(screen.getAllByTestId("revealed-restaurant-card")).toHaveLength(3);

    act(() => view.rerender(
      <DailyPicksPanel restaurants={catalog} storage={storage} visitedRestaurants={[visited]} />,
    ));

    const card = screen.getByTestId("visited-pick-card");
    expect(within(card).getByText("Visited")).toBeTruthy();
    expect(within(card).getByLabelText("4 out of 5 stars")).toBeTruthy();
    expect(screen.getAllByTestId("revealed-restaurant-card")).toHaveLength(2);
    expect(storage.getSnapshot()?.selection?.restaurantIds).toEqual(["one", "two", "three"]);
  });
  it("keeps the empty Recent Discoveries shelf present but unboxed", () => {
    const now = Date.UTC(2026, 6, 29, 12);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const storage = createDailyPicksStorage(window.localStorage);
    storage.save({
      version: 3,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection: createDailySelection(["one", "two", "three"], now),
      discoveries: [],
      savedRestaurantIds: [],
    });

    render(<DailyPicksPanel restaurants={catalog} storage={storage} />);

    expect(screen.getByRole("heading", { name: "Recent Discoveries" })).toBeTruthy();
    const shelf = document.querySelector('[data-city-empty-state="discoveries"]');
    expect(shelf).toBeTruthy();
    expect(screen.getByText("No recent discoveries")).toBeTruthy();
    expect(screen.getByText("Revealed restaurants remain here for 72 hours.")).toBeTruthy();
    // Still a marked shelf, no longer a panel: the illustration and copy carry
    // it rather than a bordered, tinted card the height of a third of the screen.
    expect(shelf?.className).not.toContain("rounded-card");
    expect(shelf?.className).not.toContain("border");
    expect(shelf?.className).not.toContain("bg-lavender");
    expect(shelf?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("places the minute-level countdown above the cards and removes the old bottom copy", () => {
    const now = Date.UTC(2026, 6, 29, 12);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const storage = createDailyPicksStorage(window.localStorage);
    storage.save({
      version: 3,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection: createDailySelection(["one", "two", "three"], now),
      discoveries: [],
      savedRestaurantIds: [],
    });

    const { unmount } = render(<DailyPicksPanel restaurants={catalog} storage={storage} />);
    const countdown = screen.getByTestId("daily-picks-countdown");
    const firstCard = screen.getAllByTestId("concealed-restaurant-card")[0];

    expect(screen.getByText("Next Picks")).toBeTruthy();
    expect(screen.getByText("23h 59m")).toBeTruthy();
    expect(countdown.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/Next selection available in/)).toBeNull();
    expect(screen.getAllByTestId("daily-picks-countdown")).toHaveLength(1);

    unmount();
  });

  it("crosses into the ready state without generating another round", () => {
    const now = Date.UTC(2026, 6, 29, 12);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const storage = createDailyPicksStorage(window.localStorage);
    const selection = {
      ...createDailySelection(["one", "two", "three"], now),
      expiresAt: new Date(now + 60_000).toISOString(),
    };
    storage.save({
      version: 3,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection,
      discoveries: [],
      savedRestaurantIds: [],
    });

    render(<DailyPicksPanel restaurants={catalog} storage={storage} />);
    expect(screen.getByText("1m")).toBeTruthy();

    act(() => vi.advanceTimersByTime(60_000));

    expect(screen.getByTestId("daily-picks-pre-generation-meta").textContent).toBe("3 PicksDaily");
    expect(screen.getByRole("button", { name: /Find today's restaurants/i })).toBeTruthy();
    expect(storage.getSnapshot()?.selection?.restaurantIds).toEqual(selection.restaurantIds);
  });

  it("cleans up its minute timer on unmount", () => {
    const clearInterval = vi.spyOn(window, "clearInterval");
    const storage = createDailyPicksStorage(window.localStorage);
    const { unmount } = render(<DailyPicksPanel restaurants={catalog} storage={storage} />);

    unmount();
    expect(clearInterval).toHaveBeenCalled();
  });

  it("persists card-by-card reveal progress and restores it across a reload", () => {
    const revealedAt = Date.UTC(2026, 6, 29, 12, 34, 56);
    vi.useFakeTimers();
    vi.setSystemTime(revealedAt);
    const firstStorage = createDailyPicksStorage(window.localStorage);
    const firstRender = render(<DailyPicksPanel restaurants={catalog} storage={firstStorage} />);

    expect(screen.getByRole("heading", { name: "Today’s Fiyu Picks" })).toBeTruthy();
    expect(screen.queryByTestId("pre-pick-preferences")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Find today's restaurants/i }));
    expect(screen.queryByTestId("pre-pick-preferences")).toBeNull();
    expect(screen.getByText("Searching nearby")).toBeTruthy();
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getByRole("heading", { name: "Today’s Fiyu Picks" })).toBeTruthy();
    const picksSection = screen.getByTestId("daily-picks-section");
    expect(picksSection.className).not.toContain("rounded-card");
    expect(picksSection.className).not.toContain("border-line");
    // The countdown shares the section heading's row and its single rule.
    const countdownRow = screen.getByTestId("daily-picks-countdown").parentElement;
    expect(countdownRow?.className).toContain("border-b");
    expect(countdownRow?.querySelector("h1")?.textContent).toBe("Today’s Fiyu Picks");
    expect(screen.getAllByTestId("concealed-restaurant-card")).toHaveLength(3);
    const selectedIds = firstStorage.getSnapshot()?.selection?.restaurantIds;
    expect(selectedIds).toHaveLength(3);
    expect(new Set(selectedIds).size).toBe(3);

    fireEvent.click(screen.getByRole("button", { name: "Tap to reveal restaurant 1" }));
    expect(screen.getAllByTestId("revealed-restaurant-card")).toHaveLength(1);
    expect(screen.getAllByTestId("concealed-restaurant-card")).toHaveLength(2);
    const firstId = selectedIds?.[0] ?? "";
    expect(firstStorage.getSnapshot()?.selection?.revealedIds).toEqual([firstId]);
    expect(firstStorage.getSnapshot()?.discoveries).toContainEqual({
      restaurantId: firstId,
      revealedAt: new Date(revealedAt + 3_000).toISOString(),
    });

    firstRender.unmount();
    const restoredRender = render(
      <DailyPicksPanel
        restaurants={catalog}
        storage={createDailyPicksStorage(window.localStorage)}
      />,
    );
    expect(screen.getAllByTestId("concealed-restaurant-card")).toHaveLength(2);
    expect(screen.getAllByTestId("revealed-restaurant-card")).toHaveLength(1);
    expect(screen.getByText(`店 ${firstId}`)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Tap to reveal restaurant 2" }));
    expect(screen.getAllByTestId("revealed-restaurant-card")).toHaveLength(2);
    expect(screen.getAllByTestId("concealed-restaurant-card")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Tap to reveal restaurant 3" }));
    expect(screen.getAllByTestId("revealed-restaurant-card")).toHaveLength(3);
    expect(screen.queryByTestId("concealed-restaurant-card")).toBeNull();

    restoredRender.unmount();
    render(
      <DailyPicksPanel
        restaurants={catalog}
        storage={createDailyPicksStorage(window.localStorage)}
      />,
    );
    expect(screen.getAllByTestId("revealed-restaurant-card")).toHaveLength(3);
  });

  it("shows the fresh-search treatment for the 1.5 second minimum", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 6, 29, 12));
    const storage = createDailyPicksStorage(window.localStorage);
    render(
      <DailyPicksPanel
        restaurants={catalog}
        storage={storage}
        activeDiscoveryLocation={{
          mode: "manual",
          label: null,
          latitude: 35.6595,
          longitude: 139.7005,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Find today's restaurants/i }));

    expect(storage.getSnapshot()?.selection?.restaurantIds).toHaveLength(3);

    const loading = () => screen.queryByTestId("fresh-picks-loading");
    expect(loading()).toBeTruthy();
    expect(screen.getByText("Searching nearby")).toBeTruthy();

    expect(screen.getAllByTestId("daily-picks-loader-dot")).toHaveLength(3);
    expect(screen.queryByTestId("city-loading-sequence")).toBeNull();

    act(() => vi.advanceTimersByTime(1_499));
    expect(loading()).toBeTruthy();
    expect(screen.queryByTestId("concealed-restaurant-card")).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(loading()).toBeNull();
    expect(screen.getAllByTestId("concealed-restaurant-card")).toHaveLength(3);
  });

  it("clears the discovery timer when the panel unmounts mid-sequence", () => {
    vi.useFakeTimers();
    const storage = createDailyPicksStorage(window.localStorage);
    const { unmount } = render(<DailyPicksPanel restaurants={catalog} storage={storage} />);
    fireEvent.click(screen.getByRole("button", { name: /Find today's restaurants/i }));

    act(() => vi.advanceTimersByTime(1_000));
    unmount();
    expect(() => act(() => vi.advanceTimersByTime(5_000))).not.toThrow();
  });

  it("renders static ink dots when reduced motion is preferred", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const storage = createDailyPicksStorage(window.localStorage);
    render(<DailyPicksPanel restaurants={catalog} storage={storage} />);
    fireEvent.click(screen.getByRole("button", { name: /Find today's restaurants/i }));

    expect(screen.getByTestId("daily-picks-dot-loader").dataset.motion).toBe("static");
    expect(
      screen.getAllByTestId("daily-picks-loader-dot").every((dot) =>
        !dot.classList.contains("fiyu-ink-dot") && dot.getAttribute("style") === null,
      ),
    ).toBe(true);
  });

  it("does not present disconnected preference controls", () => {
    const storage = createDailyPicksStorage(window.localStorage);
    render(<DailyPicksPanel restaurants={catalog} storage={storage} />);

    expect(screen.queryByText("Food interests")).toBeNull();
    expect(screen.queryByText("Non-Japanese restaurants")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit preferences" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Today’s Fiyu Picks" })).toBeTruthy();
  });

  it("preserves stored preference data without presenting it as a Picks control", () => {
    const storage = createDailyPicksStorage(window.localStorage);
    storage.save({
      ...storage.getSnapshot()!,
      preferences: { categories: ["sushi", "izakaya"], nonJapanese: "japanese-only" },
    });
    render(<DailyPicksPanel restaurants={catalog} storage={storage} />);

    expect(storage.getSnapshot()?.preferences).toEqual({
      categories: ["sushi", "izakaya"],
      nonJapanese: "japanese-only",
    });
    expect(screen.queryByRole("button", { name: "Sushi" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Japanese only" })).toBeNull();
  });

  it("returns to the neutral Picks entry point after the cooldown expires", () => {
    const now = Date.UTC(2026, 6, 30, 12);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const storage = createDailyPicksStorage(window.localStorage);
    storage.save({
      version: 2,
      preferences: { categories: ["sushi", "tempura"], nonJapanese: "japanese-only" },
      selection: createDailySelection(["one", "two", "three"], now - 24 * 60 * 60 * 1000),
      discoveries: [],
      savedRestaurantIds: [],
    });

    render(<DailyPicksPanel restaurants={catalog} storage={storage} />);
    expect(screen.getByRole("heading", { name: "Today’s Fiyu Picks" })).toBeTruthy();
    expect(screen.queryByText("Food interests")).toBeNull();
    expect(screen.getByRole("button", { name: /Find today's restaurants/i })).toBeTruthy();
    expect(screen.queryByTestId("concealed-restaurant-card")).toBeNull();
  });

  it("does not regenerate active picks when stored preferences change", () => {
    const now = Date.UTC(2026, 6, 30, 12);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const storage = createDailyPicksStorage(window.localStorage);
    const selection = createDailySelection(["one", "two", "three"], now);
    storage.save({
      version: 2,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection,
      discoveries: [],
      savedRestaurantIds: [],
    });
    render(<DailyPicksPanel restaurants={catalog} storage={storage} />);

    const current = storage.getSnapshot();
    storage.save({
      ...current!,
      preferences: { categories: ["tempura"], nonJapanese: "yes" },
    });
    expect(storage.getSnapshot()?.selection?.restaurantIds).toEqual(selection.restaurantIds);
    expect(screen.queryByTestId("pre-pick-preferences")).toBeNull();
    expect(screen.getAllByTestId("concealed-restaurant-card")).toHaveLength(3);
  });

  it("presents the mobile discovery context without taste claims or preference controls", () => {
    const now = Date.UTC(2026, 6, 30, 12);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const storage = createDailyPicksStorage(window.localStorage);
    storage.save({
      version: 2,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection: createDailySelection(["one", "two", "three"], now),
      discoveries: [],
      savedRestaurantIds: [],
    });

    render(
      <DailyPicksPanel
        restaurants={catalog}
        storage={storage}
        activeDiscoveryLocation={{
          mode: "manual",
          label: "Shibuya",
          latitude: 35.6595,
          longitude: 139.7005,
        }}
      />,
    );

    const context = screen.getByTestId("picks-location-context");
    expect(within(context).getByText("Near Shibuya")).toBeTruthy();
    expect(context.textContent).not.toContain("Selected near");
    expect(context.className).not.toContain("rounded-xl");
    expect(context.className).not.toContain("bg-lavender");
    expect(context.className).not.toContain("shadow");

    expect(within(context).queryByRole("button", { name: "Edit preferences" })).toBeNull();
    expect(within(context).queryByText(/Based on your tastes/)).toBeNull();
  });

  it("publishes and temporarily reports only newly revealed map-eligible places", () => {
    const now = Date.UTC(2026, 6, 30, 12);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const mappedOne = publicRestaurantSchema.parse({
      ...catalog[0],
      latitude: 35.658,
      longitude: 139.7016,
      location_precision: "exact",
      map_display_eligible: true,
    });
    const mappedTwo = publicRestaurantSchema.parse({
      ...catalog[1],
      latitude: 35.68,
      longitude: 139.71,
      location_precision: "exact",
      map_display_eligible: true,
    });
    const storage = createDailyPicksStorage(window.localStorage);
    storage.save({
      version: 2,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection: createDailySelection(["one", "two", "three"], now),
      discoveries: [],
      savedRestaurantIds: [],
    });
    const revealEvents: Array<{ newIds: string[]; revealedIds: string[] }> = [];
    const unsubscribe = subscribeToNewlyRevealedMapPlaces((event) => {
      revealEvents.push({ newIds: event.placeIds, revealedIds: event.revealedPlaceIds });
    });

    render(
      <DailyPicksPanel
        restaurants={[mappedOne, mappedTwo, ...catalog.slice(2)]}
        storage={storage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tap to reveal restaurant 1" }));
    expect(revealEvents).toEqual([{ newIds: ["one"], revealedIds: ["one"] }]);
    expect(screen.getByRole("status").textContent).toBe(
      "1 new place added to your map",
    );
    expect(screen.getAllByRole("button", { name: /Tap to reveal restaurant/ })).toHaveLength(2);

    act(() => vi.advanceTimersByTime(3_200));
    expect(screen.queryByTestId("new-map-place-notification")).toBeNull();
    unsubscribe();
  });

  it("does not publish reveal events from stored hydration state", () => {
    const now = Date.UTC(2026, 6, 30, 12);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const mappedOne = publicRestaurantSchema.parse({
      ...catalog[0],
      latitude: 35.658,
      longitude: 139.7016,
      location_precision: "exact",
      map_display_eligible: true,
    });
    const storage = createDailyPicksStorage(window.localStorage);
    storage.save({
      version: 2,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection: {
        ...createDailySelection(["one", "two", "three"], now),
        revealedIds: ["one"],
      },
      discoveries: [{ restaurantId: "one", revealedAt: new Date(now).toISOString() }],
      savedRestaurantIds: [],
    });
    const listener = vi.fn();
    const unsubscribe = subscribeToNewlyRevealedMapPlaces(listener);

    render(
      <DailyPicksPanel
        restaurants={[mappedOne, ...catalog.slice(1)]}
        storage={storage}
      />,
    );

    expect(listener).not.toHaveBeenCalled();
    expect(screen.queryByTestId("new-map-place-notification")).toBeNull();
    unsubscribe();
  });

  it("shows only previous revealed restaurants, newest first, without current duplicates", () => {
    const now = Date.UTC(2026, 6, 29, 12);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const storage = createDailyPicksStorage(window.localStorage);
    storage.save({
      version: 2,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection: {
        ...createDailySelection(["four", "five", "six"], now - 1_000),
        revealedIds: ["four"],
      },
      discoveries: [
        { restaurantId: "one", revealedAt: new Date(now - 8 * 60 * 60 * 1000).toISOString() },
        { restaurantId: "two", revealedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString() },
        { restaurantId: "four", revealedAt: new Date(now - 1_000).toISOString() },
      ],
      savedRestaurantIds: [],
    });

    render(<DailyPicksPanel restaurants={catalog} storage={storage} />);
    const recentSection = screen.getByRole("heading", { name: "Recent Discoveries" }).closest(
      "section",
    ) as HTMLElement;
    const recentCards = within(recentSection).getAllByTestId("compact-restaurant-card");
    expect(recentCards).toHaveLength(2);
    expect(within(recentCards[0]).getByText("Restaurant two")).toBeTruthy();
    expect(within(recentCards[1]).getByText("Restaurant one")).toBeTruthy();
    expect(within(recentSection).queryByText("Restaurant four")).toBeNull();
    expect(within(recentSection).queryByText("Restaurant three")).toBeNull();
  });

  it("exposes only individually revealed current picks plus recent IDs to the map", () => {
    const now = Date.UTC(2026, 6, 29, 12);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const storage = createDailyPicksStorage(window.localStorage);
    storage.save({
      version: 2,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection: {
        ...createDailySelection(["one", "two", "three"], now - 1_000),
        revealedIds: ["one"],
      },
      discoveries: [
        { restaurantId: "one", revealedAt: new Date(now - 1_000).toISOString() },
        { restaurantId: "four", revealedAt: new Date(now - 60_000).toISOString() },
      ],
      savedRestaurantIds: [],
    });
    const onVisibleRestaurantsChange = vi.fn();

    render(
      <DailyPicksPanel
        restaurants={catalog}
        storage={storage}
        onVisibleRestaurantsChange={onVisibleRestaurantsChange}
      />,
    );

    expect(onVisibleRestaurantsChange).toHaveBeenLastCalledWith([catalog[3], catalog[0]]);
  });

  it("removes expired discoveries without removing their saved state", () => {
    const now = Date.UTC(2026, 6, 29, 12);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const storage = createDailyPicksStorage(window.localStorage);
    storage.save({
      version: 2,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection: createDailySelection(["four", "five", "six"], now - 1_000),
      discoveries: [
        {
          restaurantId: "one",
          revealedAt: new Date(now - RECENT_DISCOVERY_DURATION_MS).toISOString(),
        },
      ],
      savedRestaurantIds: ["one"],
    });

    render(<DailyPicksPanel restaurants={catalog} storage={storage} />);
    const recentSection = screen.getByRole("heading", { name: "Recent Discoveries" }).closest(
      "section",
    ) as HTMLElement;
    expect(within(recentSection).queryByText("Restaurant one")).toBeNull();
    expect(storage.getSnapshot()?.savedRestaurantIds).toEqual(["one"]);
  });

  it("removes a discovery at its own expiry while the page remains open", () => {
    const now = Date.UTC(2026, 6, 29, 12);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const storage = createDailyPicksStorage(window.localStorage);
    storage.save({
      version: 3,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection: createDailySelection(["four", "five", "six"], now),
      discoveries: [{
        restaurantId: "one",
        revealedAt: new Date(now - RECENT_DISCOVERY_DURATION_MS + 30_000).toISOString(),
      }],
      savedRestaurantIds: [],
    });

    render(<DailyPicksPanel restaurants={catalog} storage={storage} />);
    expect(screen.getByText("Restaurant one")).toBeTruthy();

    act(() => vi.advanceTimersByTime(29_999));
    expect(screen.getByText("Restaurant one")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText("Restaurant one")).toBeNull();
  });

  it("hydrates deterministically without a localStorage mismatch", async () => {
    const storage = createDailyPicksStorage(window.localStorage);
    const element = <DailyPicksPanel restaurants={catalog} storage={storage} />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);

    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "warn").mockImplementation((...args) => {
      errors.push(args.map(String).join(" "));
    });

    await act(async () => {
      hydrateRoot(container, element);
    });

    expect(errors).toEqual([]);
    expect(container.querySelector("[data-testid='daily-picks-hydrating']")).toBeNull();
  });
});

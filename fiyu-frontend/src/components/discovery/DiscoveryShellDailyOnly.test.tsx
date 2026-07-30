// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiscoveryShell } from "@/components/discovery/DiscoveryShell";
import { publicRestaurantSchema } from "@/lib/api/schemas";
import {
  DAILY_PICKS_STORAGE_KEY,
  createDailySelection,
  parseDailyPicksState,
} from "@/lib/daily-picks/storage";

const catalog = [
  ["one", "Sushi", 35.66, 139.70],
  ["two", "Ramen", 35.68, 139.71],
  ["three", "Yakitori", 35.69, 139.73],
  ["four", "Tempura", 35.70, 139.75],
  ["five", "Izakaya", 35.71, 139.77],
  ["six", "Yakiniku", 35.72, 139.79],
].map(([placeId, category, latitude, longitude]) =>
  publicRestaurantSchema.parse({
    place_id: placeId,
    name_ja: `店 ${placeId}`,
    name_en: `Restaurant ${placeId}`,
    description_en: `Description ${placeId}`,
    category,
    food_tags: [category],
    fiyu_score: 80,
    latitude,
    longitude,
    map_display_eligible: true,
    location_precision: "exact",
  }),
);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
});

describe("daily-only discovery shell", () => {
  it.each([
    [390, 844],
    [430, 932],
    [768, 1024],
  ])("renders a floating collapsed mini-map beside the primary feed at %ix%i", (width, height) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: height });

    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    expect(screen.getByTestId("discovery-layout").className).toContain(
      "grid-rows-[minmax(0,1fr)]",
    );
    const desktopIntro = screen.getByTestId("desktop-page-intro");
    expect(desktopIntro.className).toContain("hidden");
    expect(desktopIntro.className).toContain("lg:block");
    expect(desktopIntro.textContent).toContain("Tokyo");
    expect(desktopIntro.textContent).toContain(
      "Authentic, independent, underexposed restaurants",
    );
    expect(screen.getByTestId("mobile-map-region").className).toContain("fixed");
    expect(screen.getByTestId("mobile-map-region").className).toContain("right-4");
    expect(screen.getByTestId("restaurant-scroll-region").className).toContain("row-start-1");
    expect(screen.getByTestId("restaurant-scroll-region").className).toContain("overflow-y-auto");
    expect(screen.getByTestId("restaurant-scroll-region").firstElementChild?.className).toContain(
      "pb-[calc(17rem+env(safe-area-inset-bottom))]",
    );
    expect(screen.getByRole("button", { name: "Expand map" })).toBeTruthy();
    expect(screen.getByTestId("mobile-map-region").className).toContain("lg:static");
    expect(screen.getByTestId("mobile-map-region").className).toContain(
      "bottom-[calc(var(--spacing-mobile-nav)+0.75rem)]",
    );
    const mobileHeading = screen.getByTestId("mobile-picks-page-header");
    expect(mobileHeading.className).toContain("lg:hidden");
    expect(within(mobileHeading).getByRole("heading", { level: 1, name: "Picks" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1, name: "Picks" })).toHaveLength(1);

    const scrollRegion = screen.getByTestId("restaurant-scroll-region");
    expect(scrollRegion.className).toContain("min-w-0");
    expect(scrollRegion.className).toContain("lg:w-full");
    expect(scrollRegion.firstElementChild?.className).toContain("min-w-0");
    expect(scrollRegion.firstElementChild?.className).toContain("w-full");
    expect(document.querySelector('[data-city-picks-watermark="tokyo"]')).toBeNull();
  });

  it("does not expose the full catalog below the daily feed or through map pins", () => {
    vi.useFakeTimers();
    const { container } = render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    for (const restaurant of catalog) {
      expect(screen.queryByText(restaurant.name_en ?? "")).toBeNull();
    }
    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(0);
    expect(screen.queryByText("Show distances from a starting point")).toBeNull();
    expect(screen.queryByRole("button", { name: "Place a pin" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Use my location" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Set up location" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue with current location" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue without location" }));
    fireEvent.click(screen.getByRole("button", { name: /Find today's restaurants/i }));
    expect(screen.getByText("Finding today’s restaurants…")).toBeTruthy();
    act(() => vi.advanceTimersByTime(850));
    fireEvent.click(screen.getByRole("button", { name: "Tap to reveal restaurant 1" }));

    const state = parseDailyPicksState(window.localStorage.getItem(DAILY_PICKS_STORAGE_KEY));
    const revealedId = state.selection?.revealedIds[0];
    const revealed = catalog.find((restaurant) => restaurant.place_id === revealedId);
    expect(revealed?.name_en).toBeTruthy();
    expect(screen.getAllByText(revealed?.name_en ?? "")).toHaveLength(1);
    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(3);
  });

  it("synchronizes five pins with current and recent cards by place_id", () => {
    const now = Date.now();
    window.localStorage.setItem(
      DAILY_PICKS_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        preferences: { categories: [], nonJapanese: "occasionally" },
        selection: {
          ...createDailySelection(["one", "two", "three"], now - 1_000),
          revealedIds: ["one"],
        },
        discoveries: [
          { restaurantId: "one", revealedAt: new Date(now - 1_000).toISOString() },
          { restaurantId: "four", revealedAt: new Date(now - 60_000).toISOString() },
          { restaurantId: "five", revealedAt: new Date(now - 120_000).toISOString() },
        ],
        savedRestaurantIds: [],
      }),
    );

    const { container } = render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);
    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(5);
    expect(screen.getAllByRole("heading", { level: 1, name: "Picks" })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Today’s Fiyu Picks" })).toBeTruthy();
    const dailyPanel = document.querySelector('[aria-labelledby="daily-picks-heading"]');
    expect(dailyPanel?.className).toContain("min-w-0");
    expect(dailyPanel?.className).toContain("w-full");

    fireEvent.click(screen.getByRole("button", { name: "Expand map" }));
    const panel = screen.getByTestId("mobile-map-region");
    expect(panel.dataset.expanded).toBe("true");
    expect(panel.className).toContain("left-4");
    expect(panel.className).toContain("h-[min(50dvh,32rem)]");
    const mapContent = screen.getByRole("img", { name: /Map of Tokyo/ }).querySelector(
      "g[transform]",
    ) as SVGGElement;
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const expandedTransform = mapContent.getAttribute("transform");
    fireEvent.click(screen.getByRole("button", { name: "Collapse map" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand map" }));
    expect(mapContent.getAttribute("transform")).toBe(expandedTransform);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(panel.dataset.expanded).toBe("false");

    const concealedPin = container.querySelector('[data-place-id="two"]') as HTMLElement;
    fireEvent.click(concealedPin);
    const concealedCard = container.querySelector(
      '[data-daily-card-place-id="two"]',
    ) as HTMLElement;
    expect(concealedCard.className).toContain("min-w-0");
    expect(concealedCard.className).toContain("w-full");
    expect(concealedCard.dataset.selected).toBe("true");
    expect(document.activeElement).toBe(concealedCard);
    expect(concealedCard.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(screen.queryByText("Restaurant two")).toBeNull();
    expect(concealedPin.getAttribute("aria-pressed")).toBe("true");

    const recentPin = container.querySelector('[data-place-id="four"]') as HTMLElement;
    fireEvent.click(recentPin);
    const recentCard = container.querySelector(
      '[data-daily-card-place-id="four"]',
    ) as HTMLElement;
    expect(recentCard.dataset.selected).toBe("true");
    expect(document.activeElement).toBe(recentCard);
    expect(screen.getByText("Restaurant four")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View 店 one" }));
    expect(container.querySelector('[data-place-id="one"]')?.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("hydrates the onboarding and daily feed without a mismatch", async () => {
    const element = <DiscoveryShell restaurants={catalog} areaAnchors={[]} />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args.map(String).join(" ")));
    vi.spyOn(console, "warn").mockImplementation((...args) => errors.push(args.map(String).join(" ")));

    await act(async () => {
      hydrateRoot(container, element);
    });

    expect(errors).toEqual([]);
  });
});

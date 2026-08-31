// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiscoveryShell } from "@/components/discovery/DiscoveryShell";
import { mapRestaurantSchema, publicRestaurantSchema } from "@/lib/api/schemas";
import type { DiscoveryLocation } from "@/lib/api/schemas";
import { clearAccountQueries } from "@/lib/accountQueryCache";
import {
  DAILY_PICKS_STORAGE_KEY,
  createDailySelection,
  dailyPicksStorageKey,
  parseDailyPicksState,
} from "@/lib/daily-picks/storage";
import {
  clearProfileIdentity,
  publishProfileIdentity,
} from "@/lib/profile/profileIdentity";

const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn() }));
const dailyApi = vi.hoisted(() => ({
  assignDailyPicks: vi.fn(),
  fetchActiveDailyPicks: vi.fn(),
  fetchRecentDailyPicks: vi.fn(),
  revealDailyPicks: vi.fn(),
}));
const locationApi = vi.hoisted(() => ({
  checkCurrentDiscoveryLocation: vi.fn(),
  fetchDiscoveryLocation: vi.fn(),
  saveManualDiscoveryLocation: vi.fn(),
}));
const mapApi = vi.hoisted(() => ({ fetchAuthenticatedMapRestaurants: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    assignDailyPicks: dailyApi.assignDailyPicks,
    fetchActiveDailyPicks: dailyApi.fetchActiveDailyPicks,
    fetchRecentDailyPicks: dailyApi.fetchRecentDailyPicks,
    revealDailyPicks: dailyApi.revealDailyPicks,
    checkCurrentDiscoveryLocation: locationApi.checkCurrentDiscoveryLocation,
    fetchDiscoveryLocation: locationApi.fetchDiscoveryLocation,
    saveManualDiscoveryLocation: locationApi.saveManualDiscoveryLocation,
    fetchAuthenticatedMapRestaurants: mapApi.fetchAuthenticatedMapRestaurants,
  };
});

const configuredLocation = (
  label: string,
  mode: "current" | "preview" | "manual" = "manual",
): DiscoveryLocation => ({
  configured: true,
  location_mode: mode,
  discovery_latitude: 35.6938,
  discovery_longitude: 139.7034,
  discovery_label: label,
  arrival_date: null,
  last_location_check_at: null,
  updated_at: "2026-08-10T00:00:00Z",
  can_change_location_freely: true,
});

const unconfiguredLocation: DiscoveryLocation = {
  configured: false,
  location_mode: null,
  discovery_latitude: null,
  discovery_longitude: null,
  discovery_label: null,
  arrival_date: null,
  last_location_check_at: null,
  updated_at: null,
  can_change_location_freely: true,
};

const shinjukuAnchor = {
  id: "shinjuku-station",
  display_name: "Shinjuku Station",
  area_name: "Shinjuku",
  latitude: 35.6938,
  longitude: 139.7034,
  precision: "area_anchor",
  qualifier: "Approximate center of Shinjuku",
};

const accountProfile = (userId: string, username: string) => ({
  user_id: userId,
  username,
  display_name: username,
  bio: null,
  avatar_url: null,
  created_at: "2026-08-10T00:00:00Z",
  updated_at: "2026-08-10T00:00:00Z",
});

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

function storeRevealedPick(accountId: string | null, placeId: string) {
  const selectionIds = [
    placeId,
    ...catalog
      .map((restaurant) => restaurant.place_id)
      .filter((candidate) => candidate !== placeId),
  ].slice(0, 3);
  window.localStorage.setItem(
    dailyPicksStorageKey(accountId),
    JSON.stringify({
      version: 2,
      preferences: { categories: [], nonJapanese: "occasionally" },
      selection: {
        ...createDailySelection(selectionIds, Date.now()),
        revealedIds: [placeId],
      },
      discoveries: [],
      savedRestaurantIds: [],
    }),
  );
}

function installControlledGeolocation() {
  let success: PositionCallback | undefined;
  let failure: PositionErrorCallback | undefined;
  const getCurrentPosition = vi.fn(
    (nextSuccess: PositionCallback, nextFailure?: PositionErrorCallback | null) => {
      success = nextSuccess;
      failure = nextFailure ?? undefined;
    },
  );
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  return {
    getCurrentPosition,
    grant(latitude: number, longitude: number) {
      success?.({
        coords: {
          latitude,
          longitude,
          accuracy: 25,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    },
    deny() {
      failure?.({
        code: 1,
        message: "denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
    },
  };
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  clearAccountQueries();
  clearProfileIdentity();
  window.localStorage.clear();
  window.sessionStorage.clear();
  router.push.mockReset();
  router.prefetch.mockReset();
  dailyApi.assignDailyPicks.mockReset();
  dailyApi.fetchActiveDailyPicks.mockReset();
  dailyApi.fetchRecentDailyPicks.mockReset();
  dailyApi.revealDailyPicks.mockReset();
  locationApi.fetchDiscoveryLocation.mockReset();
  locationApi.checkCurrentDiscoveryLocation.mockReset();
  locationApi.saveManualDiscoveryLocation.mockReset();
  mapApi.fetchAuthenticatedMapRestaurants.mockReset();
  mapApi.fetchAuthenticatedMapRestaurants.mockResolvedValue(catalog.slice(0, 3));
  locationApi.fetchDiscoveryLocation.mockImplementation(() => new Promise(() => undefined));
  locationApi.checkCurrentDiscoveryLocation.mockResolvedValue({
    inside_service_area: false,
    location: configuredLocation("Ginza", "preview"),
  });
  locationApi.saveManualDiscoveryLocation.mockResolvedValue(
    configuredLocation("Shinjuku", "preview"),
  );
  dailyApi.assignDailyPicks.mockResolvedValue({
    round_id: "round-one",
    city_id: "tokyo",
    place_ids: ["one", "two", "three"],
    assigned_at: new Date().toISOString(),
  });
  dailyApi.fetchActiveDailyPicks.mockResolvedValue(null);
  dailyApi.fetchRecentDailyPicks.mockResolvedValue([]);
  dailyApi.revealDailyPicks.mockResolvedValue({
    round_id: "round-one",
    place_id: "one",
    pick_revealed_at: new Date().toISOString(),
    revealed_place_ids: ["one"],
    revealed_at: null,
  });
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
  clearProfileIdentity();
  vi.restoreAllMocks();
});

describe("daily-only discovery shell", () => {
  it.each([
    [390, 844],
    [430, 932],
    [768, 1024],
  ])("keeps the final mobile Pick reachable above the fixed nav at %ix%i", async (width, height) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
    storeRevealedPick(null, "one");

    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    expect(await screen.findByTestId("discovery-layout")).toBeTruthy();
    const desktopIntro = screen.getByTestId("desktop-page-intro");
    expect(desktopIntro.className).toContain("hidden");
    expect(desktopIntro.className).toContain("lg:block");
    expect(desktopIntro.textContent).toContain("Tokyo");
    expect(desktopIntro.textContent).toContain(
      "Authentic, independent, underexposed restaurants",
    );
    expect(screen.queryByTestId("mobile-map-region")).toBeNull();
    expect(screen.getByTestId("restaurant-scroll-region").className).toContain("row-start-1");
    expect(screen.getByTestId("restaurant-scroll-region").className).toContain("overflow-y-auto");
    expect(screen.getByTestId("restaurant-scroll-region").firstElementChild?.className).toContain(
      "pb-[calc(var(--spacing-mobile-nav)+1.5rem)]",
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

  it("keeps a round concealed and reveals one card and pin at a time", async () => {
    vi.useFakeTimers();
    const { container } = render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    for (const restaurant of catalog) {
      expect(screen.queryByText(restaurant.name_en ?? "")).toBeNull();
    }
    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(0);
    expect(screen.queryByTestId("mobile-map-region")).toBeNull();
    expect(screen.queryByText("Show distances from a starting point")).toBeNull();
    expect(screen.queryByRole("button", { name: "Place a pin" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Use my location" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Set up location" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue with current location" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue without location" }));
    fireEvent.click(screen.getByRole("button", { name: /Find today's restaurants/i }));
    expect(screen.getByText("Searching nearby")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(1_500);
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Tap to reveal restaurant 1" }));

    const state = parseDailyPicksState(window.localStorage.getItem(DAILY_PICKS_STORAGE_KEY));
    expect(state.selection?.revealedIds).toEqual([state.selection?.restaurantIds[0]]);
    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(1);
    expect(screen.queryByTestId("mobile-map-region")).toBeNull();
    expect(container.querySelector('[data-place-id="two"]')).toBeNull();
    expect(container.querySelector('[data-place-id="three"]')).toBeNull();
  });

  it("restores historical pins and adds only the newly revealed current Pick", () => {
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
    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(3);
    expect(screen.getAllByRole("heading", { level: 1, name: "Picks" })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Today’s Fiyu Picks" })).toBeTruthy();
    const dailyPanel = document.querySelector('[aria-labelledby="daily-picks-heading"]');
    expect(dailyPanel?.className).toContain("min-w-0");
    expect(dailyPanel?.className).toContain("w-full");

    expect(screen.queryByTestId("mobile-map-region")).toBeNull();

    expect(container.querySelector('[data-place-id="two"]')).toBeNull();
    expect(container.querySelector('[data-place-id="three"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tap to reveal restaurant 2" }));
    const concealedPin = container.querySelector('[data-place-id="two"]') as HTMLElement;
    expect(concealedPin).toBeTruthy();
    expect(container.querySelector('[data-place-id="three"]')).toBeNull();
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
    expect(screen.getByText("Restaurant two")).toBeTruthy();
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

  it("toggles a revealed card and its matching pin from a single card activation", () => {
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
        discoveries: [{ restaurantId: "one", revealedAt: new Date(now - 1_000).toISOString() }],
        savedRestaurantIds: [],
      }),
    );

    const { container } = render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);
    const frame = container.querySelector('[data-daily-card-place-id="one"]') as HTMLElement;
    const card = within(frame).getByTestId("compact-restaurant-card");
    const pin = container.querySelector('[data-place-id="one"]') as HTMLElement;

    fireEvent.click(card);
    expect(frame.dataset.selected).toBe("true");
    expect(pin.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(card);
    expect(frame.dataset.selected).toBe("false");
    expect(pin.getAttribute("aria-pressed")).toBe("false");
  });

  it("opens detail by place_id and restores the selected card and list scroll on return", async () => {
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
        discoveries: [{ restaurantId: "one", revealedAt: new Date(now - 1_000).toISOString() }],
        savedRestaurantIds: [],
      }),
    );
    const first = render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);
    const scrollRegion = screen.getByTestId("restaurant-scroll-region");
    scrollRegion.scrollTop = 247;
    const frame = document.querySelector('[data-daily-card-place-id="one"]') as HTMLElement;

    fireEvent.click(within(frame).getByRole("button", { name: "View restaurant" }));

    expect(router.push).toHaveBeenCalledWith("/restaurants/one", { scroll: false });
    expect(JSON.parse(window.sessionStorage.getItem("fiyu.picks-detail-return.v1") ?? "null")).toMatchObject({
      placeId: "one",
      scrollTop: 247,
    });

    first.unmount();
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);
    await waitFor(() => {
      const restored = document.querySelector('[data-daily-card-place-id="one"]') as HTMLElement;
      expect(restored.dataset.selected).toBe("true");
      expect(document.activeElement).toBe(restored);
      expect(screen.getByTestId("restaurant-scroll-region").scrollTop).toBe(247);
    });
    expect(window.sessionStorage.getItem("fiyu.picks-detail-return.v1")).toBeNull();

    cleanup();
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);
    await waitFor(() => {
      const returnedAfterPrimaryNavigation = document.querySelector(
        '[data-daily-card-place-id="one"]',
      ) as HTMLElement;
      expect(returnedAfterPrimaryNavigation.dataset.selected).toBe("false");
      expect(document.querySelector('[data-place-id="one"]')?.getAttribute("aria-pressed")).toBe(
        "false",
      );
    });
  });

  it("hydrates the onboarding and daily feed without a mismatch", async () => {
    const element = <DiscoveryShell restaurants={catalog} areaAnchors={[]} />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);
    let root: ReturnType<typeof hydrateRoot> | undefined;
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args.map(String).join(" ")));
    vi.spyOn(console, "warn").mockImplementation((...args) => errors.push(args.map(String).join(" ")));

    await act(async () => {
      root = hydrateRoot(container, element);
    });

    expect(errors).toEqual([]);
    await act(async () => root?.unmount());
    container.remove();
  });

  it("shows neutral loading on hard load and restores cached location without a route-return loader", async () => {
    let resolveInitial: ((location: DiscoveryLocation) => void) | undefined;
    locationApi.fetchDiscoveryLocation.mockImplementationOnce(
      () => new Promise((resolve) => { resolveInitial = resolve; }),
    );
    publishProfileIdentity(accountProfile("account-a", "accounta"));

    const first = render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);
    expect(screen.getByTestId("fiyu-loading-screen")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Find places around you" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Use my location" })).toBeNull();
    expect(screen.queryByTestId("discovery-layout")).toBeNull();

    await act(async () => resolveInitial?.(configuredLocation("Shinjuku")));
    expect(await screen.findByTestId("discovery-layout")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Find places around you" })).toBeNull();

    first.unmount();
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    expect(screen.queryByTestId("fiyu-loading-screen")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Find places around you" })).toBeNull();
    expect(await screen.findByTestId("discovery-layout")).toBeTruthy();
    expect(locationApi.fetchDiscoveryLocation).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "Find places around you" })).toBeNull();
    expect(screen.queryByText(/Searching near/i)).toBeNull();
  });

  it("does not show the Picks entry point while the authenticated assignment is unresolved", async () => {
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(configuredLocation("Shinjuku"));
    let resolveAssignment: ((value: null) => void) | undefined;
    dailyApi.fetchActiveDailyPicks.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAssignment = resolve;
      }),
    );
    publishProfileIdentity(accountProfile("account-a", "accounta"));

    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    expect(await screen.findByTestId("fiyu-loading-screen")).toBeTruthy();
    expect(screen.queryByText("Today’s Fiyu Picks")).toBeNull();
    expect(screen.queryByTestId("pre-pick-preferences")).toBeNull();

    await act(async () => resolveAssignment?.(null));
    expect(
      await screen.findByRole("heading", { name: "Today’s Fiyu Picks" }),
    ).toBeTruthy();
  });

  it("restores all three restaurants from a previous persisted round without interactions", async () => {
    const assignedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    dailyApi.fetchRecentDailyPicks.mockResolvedValue([
      {
        round_id: "previous-round",
        city_id: "tokyo",
        place_ids: catalog.slice(0, 3).map((restaurant) => restaurant.place_id),
        assigned_at: assignedAt,
        retention_expires_at: new Date(
          Date.parse(assignedAt) + 72 * 60 * 60 * 1000,
        ).toISOString(),
        restaurants: catalog.slice(0, 3),
      },
    ]);
    locationApi.fetchDiscoveryLocation.mockResolvedValue(configuredLocation("Shinjuku"));
    publishProfileIdentity(accountProfile("account-a", "accounta"));

    const first = render(<DiscoveryShell restaurants={[]} areaAnchors={[]} />);
    await waitFor(() => {
      expect(
        JSON.parse(window.localStorage.getItem(dailyPicksStorageKey("account-a")) ?? "{}")
          .discoveries,
      ).toHaveLength(3);
    });
    const recentHeading = await screen.findByRole("heading", { name: "Recent Discoveries" });
    const recentSection = recentHeading.closest("section");
    expect(recentSection).not.toBeNull();
    for (const restaurant of catalog.slice(0, 3)) {
      expect(
        await within(recentSection as HTMLElement).findByText(restaurant.name_en ?? ""),
      ).toBeTruthy();
    }

    first.unmount();
    render(<DiscoveryShell restaurants={[]} areaAnchors={[]} />);
    expect(await screen.findByRole("heading", { name: "Recent Discoveries" })).toBeTruthy();
    expect(dailyApi.fetchRecentDailyPicks).toHaveBeenCalledTimes(1);
  });

  it("omits the mobile mini-map and its reserved space for a fresh account", async () => {
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(configuredLocation("Shinjuku"));
    publishProfileIdentity(accountProfile("account-fresh", "fresh"));

    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    const layout = await screen.findByTestId("discovery-layout");
    expect(layout).toBeTruthy();
    expect(screen.queryByTestId("mobile-map-region")).toBeNull();
    expect(screen.queryByRole("button", { name: "Expand map" })).toBeNull();
    expect(screen.getByTestId("desktop-map-region").className).toContain("hidden");
    const content = screen.getByTestId("restaurant-scroll-region").firstElementChild;
    expect(content?.className).not.toContain("pb-[calc(17rem");
    expect(content?.className).toContain("pb-[calc(var(--spacing-mobile-nav)+1.5rem)]");
  });

  it("keeps mobile Picks free of a mini-map after the first restaurant is revealed", async () => {
    const gps = installControlledGeolocation();
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(configuredLocation("Shinjuku"));
    locationApi.checkCurrentDiscoveryLocation.mockResolvedValueOnce({
      inside_service_area: true,
      location: configuredLocation("Shinjuku", "current"),
    });
    publishProfileIdentity(accountProfile("account-first-pick", "firstpick"));
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    const findButton = await screen.findByRole("button", { name: /Find today's restaurants/i });
    expect(screen.queryByTestId("mobile-map-region")).toBeNull();
    vi.useFakeTimers();
    fireEvent.click(findButton);
    expect(gps.getCurrentPosition).toHaveBeenCalledOnce();
    act(() => gps.grant(35.6938, 139.7034));
    await act(async () => Promise.resolve());
    await act(async () => {
      vi.advanceTimersByTime(1_500);
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Tap to reveal restaurant 1" }));

    expect(screen.queryByTestId("mobile-map-region")).toBeNull();
  });

  it("removes Account A's hidden desktop markers while Account B hydrates", async () => {
    storeRevealedPick("account-a", "one");
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(configuredLocation("Shinjuku"));
    mapApi.fetchAuthenticatedMapRestaurants
      .mockResolvedValueOnce([catalog[0]])
      .mockResolvedValueOnce([]);
    publishProfileIdentity(accountProfile("account-a", "accounta"));
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);
    await waitFor(() => expect(document.querySelectorAll("[data-place-id]")).toHaveLength(1));
    expect(screen.queryByTestId("mobile-map-region")).toBeNull();
    mapApi.fetchAuthenticatedMapRestaurants.mockResolvedValue([]);

    let resolveAccountB: ((location: DiscoveryLocation) => void) | undefined;
    locationApi.fetchDiscoveryLocation.mockImplementationOnce(
      () => new Promise((resolve) => { resolveAccountB = resolve; }),
    );
    act(() => publishProfileIdentity(accountProfile("account-b", "accountb")));

    expect(screen.getByTestId("fiyu-loading-screen")).toBeTruthy();
    expect(screen.queryByTestId("mobile-map-region")).toBeNull();
    expect(document.querySelectorAll("[data-place-id]")).toHaveLength(0);

    await act(async () => resolveAccountB?.(configuredLocation("Shibuya")));
    expect(await screen.findByTestId("discovery-layout")).toBeTruthy();
    expect(screen.queryByTestId("mobile-map-region")).toBeNull();
    await waitFor(() => expect(document.querySelectorAll("[data-place-id]")).toHaveLength(0));
  });

  it("renders every revealed assignment restaurant on the desktop map even when it is outside the page catalog", async () => {
    const accountId = "account-assignment-map";
    const assignmentRestaurants = [
      publicRestaurantSchema.parse({
        place_id: "ChIJI101eACJGGARsfN4y6feOtE",
        name_ja: "菜・鮮・炭 九二八",
        name_en: "Kunihachi",
        latitude: 35.67248869928656,
        longitude: 139.77404398220284,
        map_display_eligible: true,
      }),
      mapRestaurantSchema.parse({
        place_id: "ChIJe1D1MyeLGGARBHKRN0-hQUw",
        name_ja: "ワインと春巻き ROLLS",
        name_en: "ROLLS wine and springrolls",
        latitude: 35.657883468626316,
        longitude: 139.75669375698615,
        map_display_eligible: true,
        is_visited: true,
      }),
      mapRestaurantSchema.parse({
        place_id: "ChIJF0XdG2CJGGARXPEmJ6ULqUA",
        name_ja: "幸田",
        name_en: "Koda",
        latitude: 35.66981542005488,
        longitude: 139.77259448466774,
        map_display_eligible: true,
        is_visited: true,
      }),
    ];
    const placeIds = assignmentRestaurants.map((restaurant) => restaurant.place_id);
    const now = Date.now();
    window.localStorage.setItem(
      dailyPicksStorageKey(accountId),
      JSON.stringify({
        version: 3,
        preferences: { categories: [], nonJapanese: "occasionally" },
        selection: {
          ...createDailySelection(placeIds, now - 1_000),
          revealedIds: placeIds,
        },
        discoveries: [],
        savedRestaurantIds: [],
      }),
    );
    dailyApi.fetchActiveDailyPicks.mockResolvedValueOnce({
      round_id: "current-assignment",
      city_id: "tokyo",
      place_ids: placeIds,
      restaurants: assignmentRestaurants,
      assigned_at: new Date(now - 1_000).toISOString(),
      expires_at: new Date(now + 60_000).toISOString(),
      revealed_place_ids: placeIds,
      revealed_at: new Date(now - 500).toISOString(),
    });
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(configuredLocation("Shinjuku"));
    mapApi.fetchAuthenticatedMapRestaurants.mockResolvedValue(assignmentRestaurants);
    publishProfileIdentity(accountProfile(accountId, "assignmentmap"));

    render(<DiscoveryShell restaurants={[assignmentRestaurants[0]]} areaAnchors={[]} />);

    const mapRegion = await screen.findByTestId("desktop-map-region");
    await waitFor(() => {
      expect(mapRegion.querySelectorAll('[data-marker-kind="restaurant"]')).toHaveLength(3);
    });
    expect(mapRegion.querySelector('[data-marker-kind="restaurant-cluster"]')).toBeNull();
    for (const placeId of placeIds) {
      expect(mapRegion.querySelector(`[data-place-id="${placeId}"]`)).toBeTruthy();
    }
    const visitedMarker = mapRegion.querySelector(
      '[data-place-id="ChIJe1D1MyeLGGARBHKRN0-hQUw"]',
    );
    expect(visitedMarker?.getAttribute("data-visited")).toBe("true");
    expect(visitedMarker?.querySelectorAll("circle")[2]?.getAttribute("fill")).toBe(
      "var(--map-marker-visited)",
    );

    fireEvent.click(visitedMarker as Element);
    const visitedPopup = mapRegion.querySelector('[data-layer="restaurant-popup"]') as HTMLElement;
    expect(visitedPopup).toBeTruthy();
    expect(visitedPopup.getAttribute("data-place-id")).toBe(assignmentRestaurants[1].place_id);
    expect(within(visitedPopup).getByText("ワインと春巻き ROLLS")).toBeTruthy();
    expect(within(visitedPopup).getByText("Visited")).toBeTruthy();
    expect(within(visitedPopup).getByRole("link", { name: "View restaurant →" })
      .getAttribute("href")).toBe(`/restaurants/${assignmentRestaurants[1].place_id}`);

    const otherVisitedMarker = mapRegion.querySelector(
      `[data-marker-kind="restaurant"][data-place-id="${assignmentRestaurants[2].place_id}"]`,
    );
    fireEvent.click(otherVisitedMarker as Element);
    const updatedPopup = mapRegion.querySelector('[data-layer="restaurant-popup"]') as HTMLElement;
    expect(updatedPopup.getAttribute("data-place-id")).toBe(assignmentRestaurants[2].place_id);
    expect(within(updatedPopup).getByText("幸田")).toBeTruthy();

    const activeMarker = mapRegion.querySelector(
      `[data-marker-kind="restaurant"][data-place-id="${assignmentRestaurants[0].place_id}"]`,
    );
    fireEvent.click(activeMarker as Element);
    expect(mapRegion.querySelector('[data-layer="restaurant-popup"]')).toBeNull();

    const markerPoints = [...mapRegion.querySelectorAll<SVGGElement>('[data-marker-kind="restaurant"]')]
      .map((marker) => {
        const circle = marker.querySelector("circle");
        return `${circle?.getAttribute("cx")}:${circle?.getAttribute("cy")}`;
      });
    expect(new Set(markerPoints).size).toBe(3);

    const rollsFrame = document.querySelector(
      '[data-daily-card-place-id="ChIJe1D1MyeLGGARBHKRN0-hQUw"]',
    ) as HTMLElement;
    fireEvent.click(within(rollsFrame).getByTestId("compact-restaurant-card"));
    expect(
      mapRegion.querySelector('[data-place-id="ChIJe1D1MyeLGGARBHKRN0-hQUw"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("removes stale unrevealed markers when a new authenticated round is assigned", async () => {
    const accountId = "account-stale-map";
    const now = Date.now();
    window.localStorage.setItem(
      dailyPicksStorageKey(accountId),
      JSON.stringify({
        version: 3,
        preferences: { categories: [], nonJapanese: "occasionally" },
        selection: {
          restaurantIds: ["one", "two", "three"],
          revealedIds: ["one"],
          generatedAt: new Date(now - 26 * 60 * 60 * 1_000).toISOString(),
          expiresAt: new Date(now - 2 * 60 * 60 * 1_000).toISOString(),
        },
        discoveries: [
          { restaurantId: "one", revealedAt: new Date(now - 25 * 60 * 60 * 1_000).toISOString() },
        ],
        savedRestaurantIds: [],
      }),
    );
    dailyApi.fetchRecentDailyPicks.mockResolvedValueOnce([{
      round_id: "expired-round",
      city_id: "tokyo",
      place_ids: ["one"],
      assigned_at: new Date(now - 26 * 60 * 60 * 1_000).toISOString(),
      retention_expires_at: new Date(now + 46 * 60 * 60 * 1_000).toISOString(),
      restaurants: [catalog[0]],
    }]);
    dailyApi.assignDailyPicks.mockResolvedValueOnce({
      round_id: "new-hidden-round",
      city_id: "tokyo",
      place_ids: ["four", "five", "six"],
      assigned_at: new Date(now).toISOString(),
      expires_at: new Date(now + 24 * 60 * 60 * 1_000).toISOString(),
      revealed_place_ids: [],
      restaurants: catalog.slice(3),
    });
    mapApi.fetchAuthenticatedMapRestaurants
      .mockResolvedValueOnce(catalog.slice(0, 3))
      .mockResolvedValueOnce([catalog[0]]);
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(configuredLocation("Shinjuku"));
    locationApi.checkCurrentDiscoveryLocation.mockResolvedValueOnce({
      inside_service_area: true,
      location: configuredLocation("Shinjuku", "current"),
    });
    const gps = installControlledGeolocation();
    publishProfileIdentity(accountProfile(accountId, "stalemap"));
    const { container } = render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    await waitFor(() =>
      expect(container.querySelectorAll('[data-marker-kind="restaurant"]')).toHaveLength(3),
    );
    fireEvent.click(await screen.findByRole("button", { name: /Find today's restaurants/i }));
    act(() => gps.grant(35.6938, 139.7034));
    await waitFor(() =>
      expect(screen.getAllByTestId("concealed-restaurant-card")).toHaveLength(3),
      { timeout: 3_000 },
    );

    await waitFor(() =>
      expect(container.querySelectorAll('[data-marker-kind="restaurant"]')).toHaveLength(1),
    );
    expect(container.querySelector('[data-place-id="one"]')).toBeTruthy();
    expect(container.querySelector('[data-place-id="two"]')).toBeNull();
    expect(container.querySelector('[data-place-id="three"]')).toBeNull();
    expect(container.querySelector('[data-place-id="four"]')).toBeNull();
    expect(mapApi.fetchAuthenticatedMapRestaurants).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale Tokyo cache and requires a preview when fresh GPS is outside", async () => {
    const gps = installControlledGeolocation();
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(
      configuredLocation("Ginza", "current"),
    );
    locationApi.checkCurrentDiscoveryLocation.mockResolvedValueOnce({
      inside_service_area: false,
      location: configuredLocation("Ginza", "current"),
    });
    publishProfileIdentity(accountProfile("account-a", "accounta"));
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[shinjukuAnchor]} />);

    fireEvent.click(await screen.findByRole("button", { name: /Find today's restaurants/i }));
    await waitFor(() => expect(gps.getCurrentPosition).toHaveBeenCalledOnce());
    act(() => gps.grant(34.6937, 135.5023));

    expect(await screen.findByRole("heading", { name: "Heading to Tokyo?" })).toBeTruthy();
    expect(dailyApi.assignDailyPicks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Choose Tokyo area" }));
    fireEvent.click(screen.getByRole("option", { name: /Shinjuku/ }));
    fireEvent.click(screen.getByRole("button", { name: "Explore this area" }));
    await waitFor(() => expect(dailyApi.assignDailyPicks).toHaveBeenCalledWith(
      expect.objectContaining({
        active_area: "Shinjuku",
        location_mode: "preview",
        location_state: "outside_tokyo_with_preview_area",
        discovery_latitude: 35.6938,
        discovery_longitude: 139.7034,
      }),
      expect.anything(),
    ));
  });

  it("does not silently reuse a persisted preview when live GPS is outside", async () => {
    const gps = installControlledGeolocation();
    const preview = {
      ...configuredLocation("Ginza", "preview"),
      discovery_latitude: 35.6717,
      discovery_longitude: 139.765,
    };
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(preview);
    locationApi.checkCurrentDiscoveryLocation.mockResolvedValueOnce({
      inside_service_area: false,
      location: preview,
    });
    publishProfileIdentity(accountProfile("account-a", "accounta"));
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[shinjukuAnchor]} />);

    fireEvent.click(await screen.findByRole("button", { name: /Find today's restaurants/i }));
    await waitFor(() => expect(gps.getCurrentPosition).toHaveBeenCalledOnce());
    act(() => gps.grant(34.6937, 135.5023));
    await waitFor(() =>
      expect(locationApi.checkCurrentDiscoveryLocation).toHaveBeenCalledWith(
        34.6937,
        135.5023,
      ),
    );
    expect(await screen.findByRole("heading", { name: "Heading to Tokyo?" })).toBeTruthy();
    expect(dailyApi.assignDailyPicks).not.toHaveBeenCalled();
  });

  it("promotes confirmed in-Tokyo GPS over a persisted preview for the next round", async () => {
    const gps = installControlledGeolocation();
    const preview = configuredLocation("Ginza", "preview");
    const live = {
      ...configuredLocation("Shibuya", "current"),
      discovery_latitude: 35.658,
      discovery_longitude: 139.7016,
    };
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(preview);
    locationApi.checkCurrentDiscoveryLocation.mockResolvedValueOnce({
      inside_service_area: true,
      location: live,
    });
    publishProfileIdentity(accountProfile("account-a", "accounta"));
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: /Find today's restaurants/i }));
    await waitFor(() => expect(gps.getCurrentPosition).toHaveBeenCalledOnce());
    act(() => gps.grant(35.658, 139.7016));
    await waitFor(() =>
      expect(locationApi.checkCurrentDiscoveryLocation).toHaveBeenCalledWith(
        35.658,
        139.7016,
      ),
    );
    await waitFor(() => expect(dailyApi.assignDailyPicks).toHaveBeenCalledWith(
      expect.objectContaining({
        active_area: "Shibuya",
        location_mode: "current",
        location_state: "in_tokyo_live_gps",
        discovery_latitude: 35.658,
        discovery_longitude: 139.7016,
      }),
      expect.anything(),
    ));
  });

  it("restores an active snapshot without requesting or checking location", async () => {
    const gps = installControlledGeolocation();
    const now = Date.now();
    dailyApi.fetchActiveDailyPicks.mockResolvedValueOnce({
      round_id: "existing-round",
      city_id: "tokyo",
      place_ids: ["one", "two", "three"],
      restaurants: catalog.slice(0, 3),
      assigned_at: new Date(now - 1_000).toISOString(),
      expires_at: new Date(now + 60_000).toISOString(),
    });
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(
      configuredLocation("Ginza", "preview"),
    );
    publishProfileIdentity(accountProfile("account-a", "accounta"));
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    await screen.findByTestId("discovery-layout");

    expect(gps.getCurrentPosition).not.toHaveBeenCalled();
    expect(locationApi.checkCurrentDiscoveryLocation).not.toHaveBeenCalled();
    expect(dailyApi.assignDailyPicks).not.toHaveBeenCalled();
  });

  it("reuses the cached active round on navigation return without a duplicate Picks request", async () => {
    const now = Date.now();
    dailyApi.fetchActiveDailyPicks.mockResolvedValue({
      round_id: "cached-round",
      city_id: "tokyo",
      place_ids: ["one", "two", "three"],
      restaurants: catalog.slice(0, 3),
      assigned_at: new Date(now - 1_000).toISOString(),
      expires_at: new Date(now + 60_000).toISOString(),
      discovery_mode: "current",
      discovery_label: "Ginza",
    });
    dailyApi.fetchRecentDailyPicks.mockResolvedValue([]);
    locationApi.fetchDiscoveryLocation.mockResolvedValue(
      configuredLocation("Ginza", "current"),
    );
    publishProfileIdentity(accountProfile("account-cache", "accountcache"));

    const firstVisit = render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);
    await waitFor(() => expect(dailyApi.fetchActiveDailyPicks).toHaveBeenCalledOnce());
    expect(await screen.findByTestId("daily-picks-countdown")).toBeTruthy();
    firstVisit.unmount();

    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);
    expect(await screen.findByTestId("daily-picks-countdown")).toBeTruthy();
    expect(dailyApi.fetchActiveDailyPicks).toHaveBeenCalledOnce();
  });

  it("hydrates a live-GPS round without a redundant location prefix", async () => {
    const now = Date.now();
    dailyApi.fetchActiveDailyPicks.mockResolvedValueOnce({
      round_id: "gps-round",
      city_id: "tokyo",
      place_ids: ["one", "two", "three"],
      restaurants: catalog.slice(0, 3),
      assigned_at: new Date(now - 1_000).toISOString(),
      expires_at: new Date(now + 60_000).toISOString(),
      discovery_mode: "current",
      discovery_label: "Ginza",
    });
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(
      configuredLocation("Ginza", "current"),
    );
    publishProfileIdentity(accountProfile("account-a", "accounta"));

    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    await waitFor(() => expect(dailyApi.fetchActiveDailyPicks).toHaveBeenCalledOnce());
    await waitFor(() => expect(locationApi.fetchDiscoveryLocation).toHaveBeenCalledOnce());
    expect(await screen.findByText("3 picks selected")).toBeTruthy();
    expect(screen.queryByText(/Near (you|Ginza)/)).toBeNull();
  });

  it("restores an account-backed revealed round without asking for another reveal", async () => {
    const now = Date.now();
    dailyApi.fetchActiveDailyPicks.mockResolvedValueOnce({
      round_id: "revealed-round",
      city_id: "tokyo",
      place_ids: ["one", "two", "three"],
      restaurants: catalog.slice(0, 3),
      assigned_at: new Date(now - 1_000).toISOString(),
      expires_at: new Date(now + 60_000).toISOString(),
      revealed_at: new Date(now - 500).toISOString(),
      revealed_place_ids: ["one", "two", "three"],
      discovery_mode: "current",
      discovery_label: "Ginza",
    });
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(
      configuredLocation("Ginza", "current"),
    );
    publishProfileIdentity(accountProfile("account-a", "accounta"));

    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    await waitFor(() => {
      expect(screen.getAllByTestId("revealed-restaurant-card")).toHaveLength(3);
    });
    expect(screen.queryByTestId("concealed-restaurant-card")).toBeNull();
    expect(dailyApi.revealDailyPicks).not.toHaveBeenCalled();
  });

  it("persists an account reveal for only the selected Pick", async () => {
    const now = Date.now();
    dailyApi.fetchActiveDailyPicks.mockResolvedValueOnce({
      round_id: "concealed-round",
      city_id: "tokyo",
      place_ids: ["one", "two", "three"],
      restaurants: catalog.slice(0, 3),
      assigned_at: new Date(now - 1_000).toISOString(),
      expires_at: new Date(now + 60_000).toISOString(),
      revealed_at: null,
      revealed_place_ids: [],
      discovery_mode: "current",
      discovery_label: "Ginza",
    });
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(
      configuredLocation("Ginza", "current"),
    );
    publishProfileIdentity(accountProfile("account-a", "accounta"));
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Tap to reveal restaurant 1" }));
    await waitFor(() => {
      expect(dailyApi.revealDailyPicks).toHaveBeenCalledTimes(1);
    });
    expect(dailyApi.revealDailyPicks).toHaveBeenCalledWith(
      "concealed-round",
      "one",
      expect.anything(),
    );
    expect(screen.getAllByTestId("revealed-restaurant-card")).toHaveLength(1);
    expect(screen.getAllByTestId("concealed-restaurant-card")).toHaveLength(2);
  });

  it("requires manual area selection when fresh geolocation permission is denied", async () => {
    const gps = installControlledGeolocation();
    const preview = configuredLocation("Ginza", "preview");
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(preview);
    publishProfileIdentity(accountProfile("account-a", "accounta"));
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[shinjukuAnchor]} />);

    fireEvent.click(await screen.findByRole("button", { name: /Find today's restaurants/i }));
    await waitFor(() => expect(gps.getCurrentPosition).toHaveBeenCalledOnce());
    act(() => gps.deny());

    expect(locationApi.checkCurrentDiscoveryLocation).not.toHaveBeenCalled();
    expect(await screen.findByText(/Location isn't available/)).toBeTruthy();
    expect(dailyApi.assignDailyPicks).not.toHaveBeenCalled();
  });

  it("requires a current-session preview even when a saved manual area exists", async () => {
    const gps = installControlledGeolocation();
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(configuredLocation("Shibuya"));
    locationApi.checkCurrentDiscoveryLocation.mockResolvedValueOnce({
      inside_service_area: false,
      location: configuredLocation("Shibuya"),
    });
    publishProfileIdentity(accountProfile("account-a", "accounta"));
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[shinjukuAnchor]} />);

    fireEvent.click(await screen.findByRole("button", { name: /Find today's restaurants/i }));
    await waitFor(() => expect(gps.getCurrentPosition).toHaveBeenCalledOnce());
    act(() => gps.grant(34.6937, 135.5023));

    expect(await screen.findByRole("heading", { name: "Heading to Tokyo?" })).toBeTruthy();
    expect(dailyApi.assignDailyPicks).not.toHaveBeenCalled();
  });

  it("does not add a post-request delay when a fresh assignment exceeds the minimum", async () => {
    const gps = installControlledGeolocation();
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(configuredLocation("Shibuya"));
    locationApi.checkCurrentDiscoveryLocation.mockResolvedValueOnce({
      inside_service_area: true,
      location: configuredLocation("Shibuya", "current"),
    });
    publishProfileIdentity(accountProfile("account-a", "accounta"));
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);
    const button = await screen.findByRole("button", { name: /Find today's restaurants/i });
    let resolveAssignment: ((value: {
      round_id: string;
      city_id: string;
      place_ids: string[];
      assigned_at: string;
    }) => void) | undefined;
    dailyApi.assignDailyPicks.mockImplementationOnce(
      () => new Promise((resolve) => { resolveAssignment = resolve; }),
    );
    vi.useFakeTimers();

    fireEvent.click(button);
    expect(gps.getCurrentPosition).toHaveBeenCalledOnce();
    act(() => gps.grant(35.6938, 139.7034));
    await act(async () => Promise.resolve());
    act(() => vi.advanceTimersByTime(4_000));
    await act(async () => {
      resolveAssignment?.({
        round_id: "round-slow",
        city_id: "tokyo",
        place_ids: ["one", "two", "three"],
        assigned_at: new Date().toISOString(),
      });
      await Promise.resolve();
    });

    expect(screen.queryByTestId("fresh-picks-loading")).toBeNull();
    expect(screen.getAllByTestId("concealed-restaurant-card")).toHaveLength(3);
  });

  it("renders setup only after a successful response confirms location is not configured", async () => {
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(unconfiguredLocation);
    publishProfileIdentity(accountProfile("account-a", "accounta"));

    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    expect(screen.getByTestId("fiyu-loading-screen")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Find places around you" })).toBeTruthy();
    expect(screen.queryByTestId("fiyu-loading-screen")).toBeNull();
  });

  it("keeps location failures distinct from the not-configured setup state", async () => {
    locationApi.fetchDiscoveryLocation.mockRejectedValueOnce(new Error("network unavailable"));
    publishProfileIdentity(accountProfile("account-a", "accounta"));

    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    expect(await screen.findByText("We couldn't load your location.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Find places around you" })).toBeNull();

    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(configuredLocation("Shinjuku"));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("discovery-layout")).toBeTruthy();
  });

  it("masks the previous account while a newly selected account location hydrates", async () => {
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(configuredLocation("Shinjuku"));
    publishProfileIdentity(accountProfile("account-a", "accounta"));
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);
    expect(await screen.findByTestId("discovery-layout")).toBeTruthy();

    let resolveAccountB: ((location: DiscoveryLocation) => void) | undefined;
    locationApi.fetchDiscoveryLocation.mockImplementationOnce(
      () => new Promise((resolve) => { resolveAccountB = resolve; }),
    );
    act(() => publishProfileIdentity(accountProfile("account-b", "accountb")));

    expect(screen.getByTestId("fiyu-loading-screen")).toBeTruthy();
    expect(screen.queryByTestId("discovery-layout")).toBeNull();
    expect(screen.queryByText("Shinjuku")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Find places around you" })).toBeNull();

    await act(async () => resolveAccountB?.(unconfiguredLocation));
    expect(await screen.findByRole("heading", { name: "Find places around you" })).toBeTruthy();
    expect(screen.queryByText("Shinjuku")).toBeNull();
  });
});

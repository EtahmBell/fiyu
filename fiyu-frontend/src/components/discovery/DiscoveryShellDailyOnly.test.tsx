// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiscoveryShell } from "@/components/discovery/DiscoveryShell";
import { publicRestaurantSchema } from "@/lib/api/schemas";
import type { DiscoveryLocation } from "@/lib/api/schemas";
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

const router = vi.hoisted(() => ({ push: vi.fn() }));
const dailyApi = vi.hoisted(() => ({
  assignDailyPicks: vi.fn(),
  fetchActiveDailyPicks: vi.fn(),
}));
const locationApi = vi.hoisted(() => ({ fetchDiscoveryLocation: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    assignDailyPicks: dailyApi.assignDailyPicks,
    fetchActiveDailyPicks: dailyApi.fetchActiveDailyPicks,
    fetchDiscoveryLocation: locationApi.fetchDiscoveryLocation,
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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  clearProfileIdentity();
  window.localStorage.clear();
  window.sessionStorage.clear();
  router.push.mockReset();
  dailyApi.assignDailyPicks.mockReset();
  dailyApi.fetchActiveDailyPicks.mockReset();
  locationApi.fetchDiscoveryLocation.mockReset();
  locationApi.fetchDiscoveryLocation.mockImplementation(() => new Promise(() => undefined));
  dailyApi.assignDailyPicks.mockResolvedValue({
    round_id: "round-one",
    city_id: "tokyo",
    place_ids: ["one", "two", "three"],
    assigned_at: new Date().toISOString(),
  });
  dailyApi.fetchActiveDailyPicks.mockResolvedValue(null);
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
  ])("renders a floating collapsed mini-map beside the primary feed at %ix%i", async (width, height) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
    storeRevealedPick(null, "one");

    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    expect((await screen.findByTestId("discovery-layout")).className).toContain(
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

  it("does not expose concealed assignments through map pins", async () => {
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
    const revealedId = state.selection?.revealedIds[0];
    const revealed = catalog.find((restaurant) => restaurant.place_id === revealedId);
    expect(revealed?.name_en).toBeTruthy();
    expect(screen.getAllByText(revealed?.name_en ?? "")).toHaveLength(1);
    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(1);
    expect(screen.getByTestId("mobile-map-region")).toBeTruthy();
    expect(container.querySelector('[data-place-id="two"]')).toBeNull();
    expect(container.querySelector('[data-place-id="three"]')).toBeNull();
  });

  it("restores revealed pins and adds concealed current picks independently", () => {
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

  it("shows neutral Fiyu loading on hard load and route return until a saved location resolves", async () => {
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
    let resolveReturn: ((location: DiscoveryLocation) => void) | undefined;
    locationApi.fetchDiscoveryLocation.mockImplementationOnce(
      () => new Promise((resolve) => { resolveReturn = resolve; }),
    );
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    expect(screen.getByTestId("fiyu-loading-screen")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Find places around you" })).toBeNull();
    await act(async () => resolveReturn?.(configuredLocation("Shinjuku")));
    expect(await screen.findByTestId("discovery-layout")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Find places around you" })).toBeNull();
    expect(screen.queryByText(/Searching near/i)).toBeNull();
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
    expect(content?.className).toContain("pb-[calc(1.5rem");
  });

  it("shows the mobile mini-map reactively after the first restaurant is revealed", async () => {
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(configuredLocation("Shinjuku"));
    publishProfileIdentity(accountProfile("account-first-pick", "firstpick"));
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    const findButton = await screen.findByRole("button", { name: /Find today's restaurants/i });
    expect(screen.queryByTestId("mobile-map-region")).toBeNull();
    vi.useFakeTimers();
    fireEvent.click(findButton);
    await act(async () => {
      vi.advanceTimersByTime(1_500);
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Tap to reveal restaurant 1" }));

    expect(screen.getByTestId("mobile-map-region")).toBeTruthy();
    expect(document.querySelectorAll("[data-place-id]")).toHaveLength(1);
  });

  it("removes Account A's mini-map while Account B with no markers hydrates", async () => {
    storeRevealedPick("account-a", "one");
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(configuredLocation("Shinjuku"));
    publishProfileIdentity(accountProfile("account-a", "accounta"));
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);
    expect(await screen.findByTestId("mobile-map-region")).toBeTruthy();

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
    expect(document.querySelectorAll("[data-place-id]")).toHaveLength(0);
  });

  it("uses the saved current-location record for both fresh-search copy and assignment", async () => {
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(
      configuredLocation("Shinjuku", "current"),
    );
    publishProfileIdentity(accountProfile("account-a", "accounta"));
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: /Find today's restaurants/i }));

    expect(screen.getByText("Searching near you")).toBeTruthy();
    expect(dailyApi.assignDailyPicks).toHaveBeenCalledWith(
      expect.objectContaining({
        active_area: "Shinjuku",
        discovery_latitude: 35.6938,
        discovery_longitude: 139.7034,
      }),
      expect.anything(),
    );
  });

  it("uses one saved manual-location snapshot for the label and assignment coordinates", async () => {
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(configuredLocation("Shibuya"));
    publishProfileIdentity(accountProfile("account-a", "accounta"));
    render(<DiscoveryShell restaurants={catalog} areaAnchors={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: /Find today's restaurants/i }));

    expect(screen.getByText("Searching near Shibuya")).toBeTruthy();
    expect(dailyApi.assignDailyPicks).toHaveBeenCalledWith(
      expect.objectContaining({
        active_area: "Shibuya",
        discovery_latitude: 35.6938,
        discovery_longitude: 139.7034,
      }),
      expect.anything(),
    );
  });

  it("does not add a post-request delay when a fresh assignment exceeds the minimum", async () => {
    locationApi.fetchDiscoveryLocation.mockResolvedValueOnce(configuredLocation("Shibuya"));
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

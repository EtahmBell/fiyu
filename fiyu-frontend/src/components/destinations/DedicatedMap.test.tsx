// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DedicatedMap } from "@/components/destinations/DedicatedMap";
import {
  accountQueryKey,
  clearAccountQueries,
  writeAccountQuery,
} from "@/lib/accountQueryCache";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { mapRestaurantSchema, publicRestaurantSchema } from "@/lib/api/schemas";
import { clearProfileIdentity, publishProfileIdentity } from "@/lib/profile/profileIdentity";

const api = vi.hoisted(() => ({
  fetchAuthenticatedMapRestaurants: vi.fn(),
  fetchMapRestaurants: vi.fn(),
}));
const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/api/client", () => ({
  fetchAuthenticatedMapRestaurants: api.fetchAuthenticatedMapRestaurants,
  fetchMapRestaurants: api.fetchMapRestaurants,
}));

const verifiedLocationCatalog = [
  ["ChIJAZOKBEyPGGARWoSCCwgRm8E", "あたらよ 秋葉原店", "Atarayo Akihabara", 35.6978436, 139.7741913],
  ["ChIJKdddfwDzGGAR1YfPayuwpFo", "浜田山叙々苑", "Hamadayama Jojoen", 35.68212640976458, 139.6297809321488],
  ["ChIJt2QEWDmNGGARvJ5tMBSBCqI", "江戸酒場 海", "Edo Sakaba Umi", 35.673682374824864, 139.71160773428886],
  ["ChIJGZiCSQCPGGARtJeKu6kiMVo", "牛たんの檸檬 秋葉原店", "Gyutan no Lemon Akihabara", 35.69797502625716, 139.77817065934673],
].map(([placeId, nameJa, name, latitude, longitude]) =>
  mapRestaurantSchema.parse({
    place_id: placeId,
    name_ja: nameJa,
    name_en: name,
    category: "Restaurant",
    food_tags: ["Restaurant"],
    fiyu_score: 80,
    latitude,
    longitude,
    map_display_eligible: true,
    location_precision: "exact",
    is_discovered: true,
    is_saved: false,
    is_visited: false,
  }),
);

const profile = (userId: string) => ({
  user_id: userId,
  username: userId,
  display_name: userId,
  bio: null,
  avatar_url: null,
  created_at: "2026-08-10T00:00:00Z",
  updated_at: "2026-08-10T00:00:00Z",
});

beforeEach(() => {
  clearAccountQueries();
  window.localStorage.clear();
  api.fetchAuthenticatedMapRestaurants.mockReset();
  api.fetchMapRestaurants.mockReset();
  clearProfileIdentity();
  navigation.replace.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  clearProfileIdentity();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("dedicated user map", () => {
  it("keeps the compact filter and zoom controls in separate mobile corner zones", async () => {
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue([]);
    publishProfileIdentity(profile("mobile-controls"));
    render(<DedicatedMap />);

    await screen.findByText("No places yet");
    const filter = screen.getByTestId("personal-map-filter-control");
    const controls = screen.getByTestId("map-controls");
    expect(filter.contains(controls)).toBe(false);
    expect(filter.className).toContain("left-3");
    expect(filter.className).toContain("calc(100%-5.5rem)");
    expect(controls.className).toContain("right-3");
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });

  it("redirects desktop visitors without loading Map data", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
    publishProfileIdentity(profile("desktop-user"));

    render(<DedicatedMap />);

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/picks"));
    expect(api.fetchAuthenticatedMapRestaurants).not.toHaveBeenCalled();
    expect(screen.getByTestId("fiyu-loading-screen")).toBeTruthy();
  });

  it("does not substitute the four verified-location restaurants for an empty user result", async () => {
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue([]);
    api.fetchMapRestaurants.mockResolvedValue(verifiedLocationCatalog);
    publishProfileIdentity(profile("user-new"));
    const { container } = render(<DedicatedMap />);

    expect(screen.getByText("Loading your map…")).toBeTruthy();
    expect(await screen.findByText("No places yet")).toBeTruthy();
    expect(
      container.querySelectorAll('[data-layer="restaurants"] [data-marker-kind="restaurant"]'),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-layer="restaurants"] [data-place-id]'),
    ).toHaveLength(0);
    expect(container.querySelector('[data-layer="restaurant-popup"]')).toBeNull();
    expect(container.querySelector('[data-layer="stations"]')).toBeTruthy();
    expect(container.querySelector('[data-layer="landmarks"]')).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
    expect(api.fetchMapRestaurants).not.toHaveBeenCalled();
  });

  it("never falls back to anonymous browser history on the dedicated Map tab", async () => {
    api.fetchMapRestaurants.mockResolvedValue(verifiedLocationCatalog);
    const { container } = render(<DedicatedMap />);

    expect(await screen.findByText("No places yet")).toBeTruthy();
    expect(
      container.querySelectorAll('[data-layer="restaurants"] [data-place-id]'),
    ).toHaveLength(0);
    expect(container.querySelector('[data-layer="stations"]')).toBeTruthy();
    expect(container.querySelector('[data-layer="landmarks"]')).toBeTruthy();
    expect(api.fetchMapRestaurants).not.toHaveBeenCalled();
    expect(api.fetchAuthenticatedMapRestaurants).not.toHaveBeenCalled();
  });

  it("renders exactly one surfaced verified-location restaurant", async () => {
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue(verifiedLocationCatalog.slice(0, 1));
    publishProfileIdentity(profile("user-a"));
    const { container } = render(<DedicatedMap />);

    await waitFor(() =>
      expect(
        container.querySelectorAll('[data-layer="restaurants"] [data-place-id]'),
      ).toHaveLength(1),
    );
    expect(
      container.querySelectorAll('[data-layer="restaurants"] [data-marker-kind="restaurant"]'),
    ).toHaveLength(1);
    expect(container.querySelector('[data-layer="stations"]')).toBeTruthy();
    expect(container.querySelector('[data-layer="landmarks"]')).toBeTruthy();
    expect(
      container.querySelector('[data-place-id="ChIJAZOKBEyPGGARWoSCCwgRm8E"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-place-id="ChIJKdddfwDzGGAR1YfPayuwpFo"]'),
    ).toBeNull();
  });

  it("renders exactly two surfaced verified-location restaurants", async () => {
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue(verifiedLocationCatalog.slice(0, 2));
    publishProfileIdentity(profile("user-a"));
    const { container } = render(<DedicatedMap />);

    await waitFor(() =>
      expect(
        container.querySelectorAll('[data-layer="restaurants"] [data-marker-kind="restaurant"]'),
      ).toHaveLength(2),
    );
    expect(
      container.querySelector('[data-place-id="ChIJAZOKBEyPGGARWoSCCwgRm8E"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-place-id="ChIJKdddfwDzGGAR1YfPayuwpFo"]'),
    ).toBeTruthy();
  });

  it("renders visited restaurants with the secondary brass treatment", async () => {
    const visited = mapRestaurantSchema.parse({
      ...verifiedLocationCatalog[0],
      is_visited: true,
    });
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue([
      visited,
      verifiedLocationCatalog[1],
    ]);
    publishProfileIdentity(profile("user-a"));
    const { container } = render(<DedicatedMap />);

    const visitedPin = await waitFor(() => {
      const pin = container.querySelector(
        `[data-marker-kind="restaurant"][data-place-id="${visited.place_id}"]`,
      );
      expect(pin).toBeTruthy();
      return pin as Element;
    });
    const activePin = container.querySelector(
      `[data-marker-kind="restaurant"][data-place-id="${verifiedLocationCatalog[1].place_id}"]`,
    );

    expect(visitedPin.getAttribute("data-visited")).toBe("true");
    expect(visitedPin.querySelectorAll("circle")[2]?.getAttribute("fill")).toBe(
      "var(--map-marker-visited)",
    );
    expect(activePin?.getAttribute("data-visited")).toBe("false");
    expect(activePin?.querySelectorAll("circle")[2]?.getAttribute("fill")).toBe(
      "var(--map-marker)",
    );
    expect(visitedPin.querySelectorAll("circle")).toHaveLength(3);

    fireEvent.click(visitedPin);
    const popup = container.querySelector('[data-layer="restaurant-popup"]');
    expect(popup?.getAttribute("data-visited")).toBe("true");
    // The brass edge is reinforced by the word, so the state does not rest on
    // colour alone.
    expect(within(popup as HTMLElement).getByText("Visited")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Map key" }));
    const legend = document.getElementById("fiyu-map-legend") as HTMLElement;
    expect(within(legend).getByText("Discovered")).toBeTruthy();
    expect(within(legend).getByText("Visited")).toBeTruthy();
    expect(within(legend).getByText("Saved")).toBeTruthy();
  });

  it("renders only map-eligible rows returned by the authenticated seen endpoint", async () => {
    const ineligible = publicRestaurantSchema.parse({
      ...verifiedLocationCatalog[2],
      place_id: "seen-but-not-map-eligible",
      map_display_eligible: false,
    });
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue([
      verifiedLocationCatalog[0],
      ineligible,
    ]);
    publishProfileIdentity(profile("user-a"));
    const { container } = render(<DedicatedMap />);

    await waitFor(() =>
      expect(
        container.querySelectorAll('[data-layer="restaurants"] [data-marker-kind="restaurant"]'),
      ).toHaveLength(1),
    );
    expect(container.querySelector('[data-place-id="seen-but-not-map-eligible"]')).toBeNull();
    expect(api.fetchMapRestaurants).not.toHaveBeenCalled();
  });

  it("clusters only the restaurants returned for the authenticated account", async () => {
    const nearbySeen = verifiedLocationCatalog.slice(0, 3).map((restaurant, index) =>
      mapRestaurantSchema.parse({
        ...restaurant,
        latitude: 35.68 + index * 0.00001,
        longitude: 139.71 + index * 0.00001,
        is_discovered: true,
      }),
    );
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue(nearbySeen);
    publishProfileIdentity(profile("user-a"));
    const { container } = render(<DedicatedMap />);

    const cluster = await waitFor(() => {
      const marker = container.querySelector('[data-marker-kind="restaurant-cluster"]');
      expect(marker).toBeTruthy();
      return marker;
    });
    expect(cluster?.getAttribute("data-place-ids")?.split(",").sort()).toEqual(
      nearbySeen.map((restaurant) => restaurant.place_id).sort(),
    );
    expect(cluster?.textContent).toBe("3");
    expect(api.fetchMapRestaurants).not.toHaveBeenCalled();
  });

  it("restores the same unlocked map from cache after remount", async () => {
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue(verifiedLocationCatalog.slice(0, 2));
    publishProfileIdentity(profile("user-a"));
    const first = render(<DedicatedMap />);
    await waitFor(() =>
      expect(
        first.container.querySelectorAll('[data-layer="restaurants"] [data-marker-kind="restaurant"]'),
      ).toHaveLength(2),
    );
    first.unmount();

    const second = render(<DedicatedMap />);
    await waitFor(() =>
      expect(
        second.container.querySelectorAll('[data-layer="restaurants"] [data-marker-kind="restaurant"]'),
      ).toHaveLength(2),
    );
    expect(api.fetchAuthenticatedMapRestaurants).toHaveBeenCalledTimes(1);
    expect(api.fetchMapRestaurants).not.toHaveBeenCalled();
  });

  it("identifies a selected pin, replaces it, and closes from the map or Escape", async () => {
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue(verifiedLocationCatalog.slice(0, 2));
    publishProfileIdentity(profile("user-a"));
    const { container } = render(<DedicatedMap />);

    const firstPin = await waitFor(() => {
      const pin = container.querySelector(
        '[data-marker-kind="restaurant"][data-place-id="ChIJAZOKBEyPGGARWoSCCwgRm8E"]',
      );
      expect(pin).toBeTruthy();
      return pin as Element;
    });
    fireEvent.click(firstPin);

    const firstPopup = container.querySelector('[data-layer="restaurant-popup"]');
    expect(firstPopup?.textContent).toContain("あたらよ 秋葉原店");
    expect(firstPopup?.textContent).toContain("Atarayo Akihabara");
    expect(firstPopup?.textContent).toContain("Restaurant");
    const scoreSection = screen.getByTestId("map-popup-score");
    expect(scoreSection.textContent).toContain("Fiyu Score");
    expect(scoreSection.textContent).toContain("8.0");
    expect(scoreSection.className).toContain("border-t");
    expect(screen.getByText("8.0").className).toContain("text-lavender-700");
    expect(screen.getByRole("link", { name: "View restaurant →" }).getAttribute("href")).toBe(
      "/restaurants/ChIJAZOKBEyPGGARWoSCCwgRm8E",
    );

    fireEvent.click(
      container.querySelector(
        '[data-marker-kind="restaurant"][data-place-id="ChIJKdddfwDzGGAR1YfPayuwpFo"]',
      ) as Element,
    );
    const secondPopup = container.querySelector('[data-layer="restaurant-popup"]');
    expect(secondPopup?.textContent).toContain("浜田山叙々苑");
    expect(secondPopup?.textContent).toContain("Hamadayama Jojoen");
    expect(secondPopup?.textContent).not.toContain("Atarayo Akihabara");

    const mapSurface = screen.getByRole("img", { name: /Map of Tokyo/ });
    Object.defineProperty(mapSurface, "setPointerCapture", { value: vi.fn() });
    fireEvent.pointerDown(mapSurface, { pointerId: 1 });
    expect(container.querySelector('[data-layer="restaurant-popup"]')).toBeNull();

    fireEvent.click(firstPin);
    expect(container.querySelector('[data-layer="restaurant-popup"]')).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector('[data-layer="restaurant-popup"]')).toBeNull();
  });

  it("shows the owner's explicit rating separately from Fiyu Score and omits private notes", async () => {
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue([
      mapRestaurantSchema.parse({
        ...verifiedLocationCatalog[0],
        is_visited: true,
        user_rating: 4,
      }),
    ]);
    publishProfileIdentity(profile("user-a"));
    const { container } = render(<DedicatedMap />);

    const pin = await waitFor(() => {
      const found = container.querySelector('[data-marker-kind="restaurant"]');
      expect(found).toBeTruthy();
      return found as Element;
    });
    fireEvent.click(pin);

    const popup = container.querySelector('[data-layer="restaurant-popup"]') as HTMLElement;
    expect(within(popup).getByLabelText("Your rating: 4 out of 5 stars")).toBeTruthy();
    expect(within(popup).getByTestId("map-popup-score").textContent).toContain("Fiyu Score");
    expect(popup.textContent).not.toContain("private note");
  });

  it("does not fabricate a star rating for a legacy visited restaurant", async () => {
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue([
      mapRestaurantSchema.parse({
        ...verifiedLocationCatalog[0],
        is_visited: true,
        user_rating: null,
      }),
    ]);
    publishProfileIdentity(profile("user-a"));
    const { container } = render(<DedicatedMap />);
    const pin = await waitFor(() => {
      const found = container.querySelector('[data-marker-kind="restaurant"]');
      expect(found).toBeTruthy();
      return found;
    });
    fireEvent.click(pin as Element);
    expect(container.querySelector('[aria-label^="Your rating:"]')).toBeNull();
  });

  it("filters one personal Map model without moving the camera and clears only excluded selection", async () => {
    const rows = [
      mapRestaurantSchema.parse({ ...verifiedLocationCatalog[0], is_discovered: true }),
      mapRestaurantSchema.parse({
        ...verifiedLocationCatalog[1],
        is_discovered: false,
        is_saved: true,
      }),
      mapRestaurantSchema.parse({
        ...verifiedLocationCatalog[2],
        is_discovered: false,
        is_visited: true,
      }),
      mapRestaurantSchema.parse({
        ...verifiedLocationCatalog[3],
        is_discovered: true,
        is_saved: true,
        is_visited: true,
      }),
    ];
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue(rows);
    publishProfileIdentity(profile("filter-user"));
    const { container } = render(<DedicatedMap />);

    const allTab = await screen.findByRole("tab", { name: "All" });
    expect(allTab.getAttribute("aria-selected")).toBe("true");
    await waitFor(() =>
      expect(container.querySelectorAll('[data-marker-kind="restaurant"]')).toHaveLength(3),
    );
    const viewBox = container.querySelector("svg")?.getAttribute("viewBox");

    fireEvent.click(container.querySelector(`[data-place-id="${rows[0].place_id}"]`) as Element);
    expect(container.querySelector('[data-layer="restaurant-popup"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Saved" }));

    await waitFor(() => {
      expect(container.querySelectorAll('[data-marker-kind="restaurant"]')).toHaveLength(2);
      expect(container.querySelector('[data-layer="restaurant-popup"]')).toBeNull();
    });
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe(viewBox);
    const savedOnly = container.querySelector(`[data-place-id="${rows[1].place_id}"]`);
    expect(savedOnly?.getAttribute("data-marker-state")).toBe("saved");
    expect(savedOnly?.querySelectorAll("circle")[2]?.getAttribute("fill")).toBe("var(--map-bg)");
    const savedAndVisited = container.querySelector(`[data-place-id="${rows[3].place_id}"]`);
    expect(savedAndVisited?.getAttribute("data-marker-state")).toBe("visited");
    expect(savedAndVisited?.querySelectorAll("circle")[2]?.getAttribute("fill")).toBe(
      "var(--map-marker-visited)",
    );

    fireEvent.click(container.querySelector(`[data-place-id="${rows[3].place_id}"]`) as Element);
    fireEvent.click(screen.getByRole("tab", { name: "Visited" }));
    await waitFor(() =>
      expect(container.querySelector('[data-layer="restaurant-popup"]')).toBeTruthy(),
    );
    expect(container.querySelector(`[data-place-id="${rows[3].place_id}"]`)
      ?.getAttribute("data-marker-state")).toBe("visited");
    expect(api.fetchAuthenticatedMapRestaurants).toHaveBeenCalledTimes(1);
  });

  it("reclusters only the visible filter subset and supports keyboard filter navigation", async () => {
    const rows = verifiedLocationCatalog.slice(0, 3).map((restaurant, index) =>
      mapRestaurantSchema.parse({
        ...restaurant,
        latitude: 35.68 + index * 0.00001,
        longitude: 139.71 + index * 0.00001,
        is_discovered: true,
        is_saved: index < 2,
      }),
    );
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue(rows);
    publishProfileIdentity(profile("cluster-filter-user"));
    const { container } = render(<DedicatedMap />);

    await waitFor(() =>
      expect(container.querySelector('[data-marker-kind="restaurant-cluster"]')
        ?.getAttribute("data-place-ids")?.split(",")).toHaveLength(3),
    );
    const allTab = screen.getByRole("tab", { name: "All" });
    allTab.focus();
    fireEvent.keyDown(allTab.parentElement as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Saved" }));
    fireEvent.click(screen.getByRole("tab", { name: "Saved" }));
    await waitFor(() =>
      expect(container.querySelector('[data-marker-kind="restaurant-cluster"]')
        ?.getAttribute("data-place-ids")?.split(",")).toHaveLength(2),
    );
  });

  it("keeps the base map visible for an empty filter", async () => {
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue([verifiedLocationCatalog[0]]);
    publishProfileIdentity(profile("empty-filter-user"));
    const { container } = render(<DedicatedMap />);

    await screen.findByRole("tab", { name: "Visited" });
    fireEvent.click(screen.getByRole("tab", { name: "Visited" }));
    expect(await screen.findByText("No visited places yet")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector('[data-layer="stations"]')).toBeTruthy();
  });

  it("reacts to discovery expiry while retaining the restaurant in Saved", async () => {
    const accountId = "expiry-user";
    const row = mapRestaurantSchema.parse({
      ...verifiedLocationCatalog[0],
      is_discovered: true,
      is_saved: true,
    });
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue([row]);
    publishProfileIdentity(profile(accountId));
    const { container } = render(<DedicatedMap />);
    await waitFor(() =>
      expect(container.querySelector(`[data-place-id="${row.place_id}"]`)).toBeTruthy(),
    );

    act(() => writeAccountQuery(accountQueryKey("map-restaurants", accountId), [{
      ...row,
      is_discovered: false,
    }]));
    await waitFor(() =>
      expect(container.querySelector(`[data-place-id="${row.place_id}"]`)).toBeNull(),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Saved" }));
    expect(container.querySelector(`[data-place-id="${row.place_id}"]`)).toBeTruthy();
  });

  it("removes an expired discovery at its boundary without a user action", async () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 8, 9, 12);
    vi.setSystemTime(now);
    const accountId = "timed-expiry-user";
    const row = mapRestaurantSchema.parse({
      ...verifiedLocationCatalog[0],
      is_discovered: true,
      discovery_expires_at: new Date(now + 30_000).toISOString(),
    });
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue([row]);
    writeAccountQuery(accountQueryKey("map-restaurants", accountId), [row]);
    publishProfileIdentity(profile(accountId));
    const { container } = render(<DedicatedMap />);
    await act(async () => Promise.resolve());
    expect(container.querySelector(`[data-place-id="${row.place_id}"]`)).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(container.querySelector(`[data-place-id="${row.place_id}"]`)).toBeNull();
    expect(api.fetchAuthenticatedMapRestaurants).toHaveBeenCalledTimes(1);
  });

  it("masks the previous account while the next account's Map hydrates", async () => {
    api.fetchAuthenticatedMapRestaurants.mockResolvedValueOnce(verifiedLocationCatalog.slice(0, 3));
    publishProfileIdentity(profile("user-a"));
    const { container } = render(<DedicatedMap />);
    await waitFor(() =>
      expect(
        container.querySelectorAll('[data-layer="restaurants"] [data-marker-kind="restaurant"]'),
      ).toHaveLength(3),
    );

    let resolveUserB: ((restaurants: PublicRestaurant[]) => void) | undefined;
    api.fetchAuthenticatedMapRestaurants.mockImplementationOnce(
      () => new Promise((resolve) => { resolveUserB = resolve; }),
    );
    act(() => publishProfileIdentity(profile("user-b")));

    expect(screen.getByText("Loading your map…")).toBeTruthy();
    expect(
      container.querySelectorAll('[data-layer="restaurants"] [data-marker-kind="restaurant"]'),
    ).toHaveLength(0);
    await act(async () => resolveUserB?.([]));
    await waitFor(() =>
      expect(
        container.querySelectorAll('[data-layer="restaurants"] [data-marker-kind="restaurant"]'),
      ).toHaveLength(0),
    );
    expect(container.querySelector('[data-layer="stations"]')).toBeTruthy();
    expect(container.querySelector('[data-layer="landmarks"]')).toBeTruthy();
    expect(container.querySelector('[data-place-id]')).toBeNull();
  });
});

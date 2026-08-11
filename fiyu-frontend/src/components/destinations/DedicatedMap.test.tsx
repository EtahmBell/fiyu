// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DedicatedMap } from "@/components/destinations/DedicatedMap";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { publicRestaurantSchema } from "@/lib/api/schemas";
import { clearProfileIdentity, publishProfileIdentity } from "@/lib/profile/profileIdentity";

const api = vi.hoisted(() => ({
  fetchAuthenticatedMapRestaurants: vi.fn(),
  fetchMapRestaurants: vi.fn(),
}));
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
  publicRestaurantSchema.parse({
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
  window.localStorage.clear();
  api.fetchAuthenticatedMapRestaurants.mockReset();
  api.fetchMapRestaurants.mockReset();
  clearProfileIdentity();
});

afterEach(() => {
  cleanup();
  clearProfileIdentity();
  vi.restoreAllMocks();
});

describe("dedicated user map", () => {
  it("does not substitute the four verified-location restaurants for an empty user result", async () => {
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue([]);
    api.fetchMapRestaurants.mockResolvedValue(verifiedLocationCatalog);
    publishProfileIdentity(profile("user-new"));
    const { container } = render(<DedicatedMap />);

    expect(screen.getByTestId("fiyu-loading-screen")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "No places yet" })).toBeTruthy();
    expect(
      container.querySelectorAll('[data-layer="restaurants"] [data-marker-kind="restaurant"]'),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-layer="restaurants"] [data-place-id]'),
    ).toHaveLength(0);
    expect(container.querySelector('[data-layer="restaurant-popup"]')).toBeNull();
    expect(container.querySelector('[data-layer="stations"]')).toBeTruthy();
    expect(container.querySelector('[data-layer="landmarks"]')).toBeTruthy();
    expect(screen.getByText("Your Fiyu discoveries will appear here as you receive Picks.")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
    expect(api.fetchMapRestaurants).not.toHaveBeenCalled();
  });

  it("never falls back to anonymous browser history on the dedicated Map tab", async () => {
    api.fetchMapRestaurants.mockResolvedValue(verifiedLocationCatalog);
    const { container } = render(<DedicatedMap />);

    expect(await screen.findByRole("heading", { name: "No places yet" })).toBeTruthy();
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
    expect(screen.getByRole("link", { name: "View →" }).getAttribute("href")).toBe(
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

    expect(screen.getByTestId("fiyu-loading-screen")).toBeTruthy();
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

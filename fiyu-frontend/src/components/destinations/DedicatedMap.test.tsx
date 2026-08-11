// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

const catalog = [
  ["one", 35.66, 139.7],
  ["two", 35.68, 139.71],
  ["three", 35.69, 139.73],
  ["four", 35.7, 139.75],
].map(([placeId, latitude, longitude]) =>
  publicRestaurantSchema.parse({
    place_id: placeId,
    name_ja: `店 ${placeId}`,
    name_en: `Restaurant ${placeId}`,
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
  it("shows a clean zero-pin state for a brand-new authenticated account", async () => {
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue([]);
    publishProfileIdentity(profile("user-new"));
    const { container } = render(<DedicatedMap />);

    expect(screen.getByTestId("fiyu-loading-screen")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "No places yet" })).toBeTruthy();
    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-layer="restaurant-markers"] [data-place-id]'),
    ).toHaveLength(0);
    expect(container.querySelector('[data-layer="stations"]')).toBeNull();
    expect(container.querySelector('[data-layer="landmarks"]')).toBeNull();
    expect(screen.getByText("Your Fiyu discoveries will appear here as you receive Picks.")).toBeTruthy();
    expect(container.querySelector("svg")).toBeTruthy();
    expect(api.fetchMapRestaurants).not.toHaveBeenCalled();
  });

  it("renders only the authenticated user's server-provided seen restaurants", async () => {
    api.fetchAuthenticatedMapRestaurants.mockResolvedValue(catalog.slice(0, 2));
    publishProfileIdentity(profile("user-a"));
    const { container } = render(<DedicatedMap />);

    await waitFor(() =>
      expect(
        container.querySelectorAll('[data-layer="restaurant-markers"] [data-place-id]'),
      ).toHaveLength(2),
    );
    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(2);
    expect(container.querySelector('[data-layer="stations"]')).toBeNull();
    expect(container.querySelector('[data-layer="landmarks"]')).toBeNull();
    expect(container.querySelector('[data-place-id="four"]')).toBeNull();
  });

  it("masks the previous account while the next account's Map hydrates", async () => {
    api.fetchAuthenticatedMapRestaurants.mockResolvedValueOnce(catalog.slice(0, 3));
    publishProfileIdentity(profile("user-a"));
    const { container } = render(<DedicatedMap />);
    await waitFor(() => expect(container.querySelectorAll("[data-place-id]")).toHaveLength(3));

    let resolveUserB: ((restaurants: PublicRestaurant[]) => void) | undefined;
    api.fetchAuthenticatedMapRestaurants.mockImplementationOnce(
      () => new Promise((resolve) => { resolveUserB = resolve; }),
    );
    act(() => publishProfileIdentity(profile("user-b")));

    expect(screen.getByTestId("fiyu-loading-screen")).toBeTruthy();
    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(0);
    await act(async () => resolveUserB?.([catalog[3]]));
    await waitFor(() => expect(container.querySelectorAll("[data-place-id]")).toHaveLength(1));
    expect(container.querySelector('[data-place-id="four"]')).toBeTruthy();
    expect(container.querySelector('[data-place-id="one"]')).toBeNull();
  });
});

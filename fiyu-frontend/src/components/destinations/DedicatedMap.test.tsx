// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DedicatedMap } from "@/components/destinations/DedicatedMap";
import { publicRestaurantSchema } from "@/lib/api/schemas";
import { DAILY_PICKS_STORAGE_KEY, createDailySelection } from "@/lib/daily-picks/storage";

const catalog = [
  ["one", 35.66, 139.7],
  ["two", 35.68, 139.71],
  ["three", 35.69, 139.73],
  ["four", 35.7, 139.75],
  ["five", 35.71, 139.77],
  ["six", 35.72, 139.79],
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

beforeEach(() => window.localStorage.clear());

afterEach(() => cleanup());

describe("dedicated map", () => {
  it("shows only current daily and unexpired recent restaurant pins", () => {
    const now = Date.now();
    window.localStorage.setItem(
      DAILY_PICKS_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        preferences: { categories: [], nonJapanese: "occasionally" },
        selection: createDailySelection(["one", "two", "three"], now - 1_000),
        discoveries: [
          { restaurantId: "one", revealedAt: new Date(now - 1_000).toISOString() },
          { restaurantId: "four", revealedAt: new Date(now - 60_000).toISOString() },
          { restaurantId: "five", revealedAt: new Date(now - 120_000).toISOString() },
        ],
        savedRestaurantIds: [],
      }),
    );

    const { container } = render(<DedicatedMap restaurants={catalog} />);

    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(5);
    expect(container.querySelector('[data-place-id="six"]')).toBeNull();
  });

  it("does not expose catalog pins before a daily selection exists", () => {
    const { container } = render(<DedicatedMap restaurants={catalog} />);

    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(0);
    expect(container.textContent).toContain("Generate today's selection");
  });
});

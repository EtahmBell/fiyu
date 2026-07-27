import { describe, expect, it } from "vitest";

import type { PublicRestaurant } from "@/lib/api/schemas";
import { publicRestaurantSchema } from "@/lib/api/schemas";
import { isBrowsable, selectBrowsable } from "@/lib/discovery/filters";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

function make(overrides: Partial<PublicRestaurant> & { place_id: string }) {
  return publicRestaurantSchema.parse(overrides);
}

describe("isBrowsable", () => {
  it("keeps the bands that appear in the browsable lists", () => {
    for (const band of ["exceptional", "strong", "promising", "borderline"]) {
      expect(isBrowsable(make({ place_id: "x", score_band: band }))).toBe(true);
    }
  });

  it("withholds not_recommended", () => {
    expect(isBrowsable(make({ place_id: "x", score_band: "not_recommended" }))).toBe(false);
  });

  it("keeps a restaurant with no score_band rather than dropping it", () => {
    expect(isBrowsable(make({ place_id: "x" }))).toBe(true);
  });

  it("keeps an unrecognised future band rather than dropping it", () => {
    // A new backend band must not silently vanish from the catalog.
    expect(isBrowsable(make({ place_id: "x", score_band: "brand_new" }))).toBe(true);
  });
});

describe("selectBrowsable", () => {
  it("reports how many were withheld", () => {
    const result = selectBrowsable([
      make({ place_id: "a", score_band: "strong" }),
      make({ place_id: "b", score_band: "not_recommended" }),
      make({ place_id: "c", score_band: "exceptional" }),
    ]);
    expect(result.restaurants.map((r) => r.place_id)).toEqual(["a", "c"]);
    expect(result.withheld).toBe(1);
  });

  it("does not mutate the input", () => {
    const input = [make({ place_id: "a", score_band: "not_recommended" })];
    selectBrowsable(input);
    expect(input).toHaveLength(1);
  });

  it("handles an empty catalog", () => {
    expect(selectBrowsable([])).toEqual({ restaurants: [], withheld: 0 });
  });

  it("withholds exactly the not_recommended rows in the real catalog", () => {
    const catalog = restaurantsFixture.map((row) => publicRestaurantSchema.parse(row));
    const expectedWithheld = catalog.filter((r) => r.score_band === "not_recommended").length;
    const result = selectBrowsable(catalog);

    expect(expectedWithheld).toBeGreaterThan(0);
    expect(result.withheld).toBe(expectedWithheld);
    expect(result.restaurants).toHaveLength(catalog.length - expectedWithheld);
    expect(result.restaurants.some((r) => r.score_band === "not_recommended")).toBe(false);
  });
});

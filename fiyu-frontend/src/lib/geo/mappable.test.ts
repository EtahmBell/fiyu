import { describe, expect, it } from "vitest";

import type { PublicRestaurant } from "@/lib/api/schemas";
import { publicRestaurantSchema } from "@/lib/api/schemas";
import { isMappable, mappableRestaurants, unmappableCount } from "@/lib/geo/mappable";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

function make(overrides: Partial<PublicRestaurant> & { place_id: string }) {
  return publicRestaurantSchema.parse(overrides);
}

const eligible = {
  place_id: "ok",
  map_display_eligible: true,
  latitude: 35.68,
  longitude: 139.76,
  location_precision: "exact",
};

describe("isMappable", () => {
  it("accepts a fully eligible restaurant", () => {
    expect(isMappable(make(eligible))).toBe(true);
  });

  /**
   * REGRESSION GUARD. The predecessor of this test asserted that exactly three
   * precision values were plottable, which is what encoded the one-pin bug: the
   * backend emits at least nine, across three modules, and the frontend cannot
   * hold that list correct. Eligibility is the contract; precision is a label.
   */
  it("does not gate on the precision string, whatever the backend sends", () => {
    const precisions = [
      "exact",
      "exact_entrance",
      "building",
      "parcel_or_street_number",
      "block",
      "chome",
      "neighborhood",
      "ward",
      "unknown",
      "approximate",
      "area_anchor",
      "a_value_no_frontend_has_seen_yet",
      null,
    ];
    for (const location_precision of precisions) {
      expect(isMappable(make({ ...eligible, location_precision }))).toBe(true);
    }
  });

  it("rejects a restaurant the backend has not marked eligible", () => {
    expect(isMappable(make({ ...eligible, map_display_eligible: false }))).toBe(false);
    // Even with a precision value that reads reassuring.
    expect(
      isMappable(make({ ...eligible, location_precision: "exact", map_display_eligible: false })),
    ).toBe(false);
  });

  it("plots an approximate coordinate, leaving disclosure to the UI", () => {
    // Coarse is not the same as unverified. Hiding these would drop verified
    // data; lib/geo/precision.ts is what makes them legible as approximate.
    expect(
      isMappable(
        make({
          ...eligible,
          location_precision: "chome",
          map_location_approximate: true,
          location_label: "Approximate area",
        }),
      ),
    ).toBe(true);
  });

  it("rejects missing coordinates", () => {
    expect(isMappable(make({ ...eligible, latitude: null }))).toBe(false);
    expect(isMappable(make({ ...eligible, longitude: null }))).toBe(false);
  });

  it("rejects out-of-range coordinates", () => {
    expect(isMappable(make({ ...eligible, latitude: 91 }))).toBe(false);
    expect(isMappable(make({ ...eligible, longitude: -181 }))).toBe(false);
  });

  it("rejects non-finite coordinates independently of schema validation", () => {
    // Zod already refuses NaN, so this can only be reached if validation is
    // bypassed. Constructed directly to prove the second layer holds on its own.
    const nan = { ...make(eligible), latitude: Number.NaN } as PublicRestaurant;
    expect(isMappable(nan)).toBe(false);

    const infinite = { ...make(eligible), longitude: Number.POSITIVE_INFINITY } as PublicRestaurant;
    expect(isMappable(infinite)).toBe(false);
  });

  it("is backed by schema validation that rejects NaN outright", () => {
    expect(
      publicRestaurantSchema.safeParse({ place_id: "x", latitude: Number.NaN }).success,
    ).toBe(false);
  });

  it("treats 0,0 as valid in range but still requires eligibility", () => {
    // Null Island is a real coordinate; eligibility is what gates it.
    expect(isMappable(make({ ...eligible, latitude: 0, longitude: 0 }))).toBe(true);
    expect(
      isMappable(make({ ...eligible, latitude: 0, longitude: 0, map_display_eligible: false })),
    ).toBe(false);
  });
});

describe("mappableRestaurants", () => {
  it("keeps only plottable restaurants", () => {
    const result = mappableRestaurants([
      make(eligible),
      make({ place_id: "no-coords" }),
      make({ ...eligible, place_id: "ineligible", map_display_eligible: false }),
    ]);
    expect(result.map((r) => r.place_id)).toEqual(["ok"]);
  });

  it("narrows the type so coordinates are non-null", () => {
    const [first] = mappableRestaurants([make(eligible)]);
    // Compiles only because isMappable is a type guard.
    expect(first.latitude + first.longitude).toBeCloseTo(175.44);
  });

  it("returns an empty array for an empty catalog", () => {
    expect(mappableRestaurants([])).toEqual([]);
  });
});

describe("unmappableCount", () => {
  it("counts what cannot be plotted", () => {
    expect(unmappableCount([make(eligible), make({ place_id: "x" })])).toBe(1);
  });
});

describe("against the live catalog", () => {
  const catalog = restaurantsFixture.map((row) => publicRestaurantSchema.parse(row));

  /**
   * CANARY for the one-pin bug. If this drops below five, something upstream has
   * started discarding verified coordinates again -- check for a new allow-list
   * before assuming the backend changed.
   */
  it("plots all five map-eligible restaurants from the live catalog", () => {
    expect(catalog.length).toBeGreaterThan(0);

    const plotted = mappableRestaurants(catalog);
    expect(plotted.map((r) => r.place_id).sort()).toEqual(
      [
        "ChIJ2WzWhfWPGGARyYQS7SD2tIM", // 金すし, exact
        "ChIJAZOKBEyPGGARWoSCCwgRm8E", // あたらよ 秋葉原店, parcel_or_street_number
        "ChIJGZiCSQCPGGARtJeKu6kiMVo", // 牛たんの檸檬 秋葉原店, chome (withheld from lists by score band)
        "ChIJKdddfwDzGGAR1YfPayuwpFo", // 浜田山叙々苑, chome
        "ChIJt2QEWDmNGGARvJ5tMBSBCqI", // 江戸酒場 海, chome
      ].sort(),
    );
    expect(unmappableCount(catalog)).toBe(catalog.length - 5);
  });

  it("plots the three chome-anchored restaurants, not just the exact ones", () => {
    const plotted = mappableRestaurants(catalog);
    expect(plotted.filter((r) => r.map_location_approximate)).toHaveLength(3);
    expect(plotted.filter((r) => !r.map_location_approximate)).toHaveLength(2);
  });

  it("confirms the backend withholds coordinates from ineligible rows", () => {
    for (const restaurant of catalog) {
      if (!restaurant.map_display_eligible) {
        expect(restaurant.latitude).toBeNull();
        expect(restaurant.longitude).toBeNull();
      }
    }
  });
});

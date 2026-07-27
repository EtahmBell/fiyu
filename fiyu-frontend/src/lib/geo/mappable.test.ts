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

  it("accepts every provenance the backend can emit", () => {
    for (const precision of ["exact", "approximate", "area_anchor"]) {
      expect(isMappable(make({ ...eligible, location_precision: precision }))).toBe(true);
    }
  });

  it("rejects a restaurant the backend has not marked eligible", () => {
    expect(isMappable(make({ ...eligible, map_display_eligible: false }))).toBe(false);
  });

  it("rejects unknown coordinate provenance rather than plotting it", () => {
    expect(isMappable(make({ ...eligible, location_precision: "guessed" }))).toBe(false);
    expect(isMappable(make({ ...eligible, location_precision: null }))).toBe(false);
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

  it("plots nothing today, because no restaurant is map-eligible yet", () => {
    // Documents the current backend state. When coordinates are imported and
    // verified this expectation should be updated, not deleted -- it is the
    // signal that the map has real data to show.
    expect(catalog.length).toBeGreaterThan(0);
    expect(mappableRestaurants(catalog)).toEqual([]);
    expect(unmappableCount(catalog)).toBe(catalog.length);
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

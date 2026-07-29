import { describe, expect, it } from "vitest";

import { publicRestaurantSchema } from "@/lib/api/schemas";
import { isApproximateLocation, locationLabel } from "@/lib/geo/precision";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

function make(overrides: Record<string, unknown> = {}) {
  return publicRestaurantSchema.parse({ place_id: "x", ...overrides });
}

describe("isApproximateLocation", () => {
  it("is false for a precisely located restaurant", () => {
    expect(
      isApproximateLocation(
        make({
          latitude: 35.68,
          longitude: 139.76,
          location_precision: "exact",
          map_display_eligible: true,
          distance_sort_eligible: true,
        }),
      ),
    ).toBe(false);
  });

  it("is true on the primary flag", () => {
    expect(isApproximateLocation(make({ map_location_approximate: true }))).toBe(true);
  });

  /*
   * Each of the three signals is independently sufficient. The predecessor of
   * this module's sibling -- the precision allow-list in mappable.ts -- failed
   * CLOSED and silently hid verified pins. This predicate is deliberately built
   * to fail the other way: toward more disclosure, never less.
   */
  it("is true on the label alone, even without the flag", () => {
    expect(isApproximateLocation(make({ location_label: "Approximate area" }))).toBe(true);
  });

  it("is true on the anchor type alone, even without the flag", () => {
    expect(isApproximateLocation(make({ map_anchor_type: "chome" }))).toBe(true);
  });

  it("does not depend on the precision vocabulary", () => {
    // A value no frontend has seen must not silently read as precise if the
    // backend has flagged it.
    expect(
      isApproximateLocation(make({ location_precision: "some_new_level", map_anchor_type: "block" })),
    ).toBe(true);
  });
});

describe("locationLabel", () => {
  it("returns the backend's own wording verbatim", () => {
    expect(locationLabel(make({ location_label: "Approximate area" }))).toBe("Approximate area");
  });

  it("passes through wording Fiyu has never seen, without paraphrasing", () => {
    expect(locationLabel(make({ location_label: "Block-level estimate" }))).toBe(
      "Block-level estimate",
    );
  });

  it("is null for a precise coordinate", () => {
    expect(locationLabel(make({ latitude: 35.68, longitude: 139.76 }))).toBeNull();
  });

  it("never leaves an approximate coordinate silent", () => {
    // Flagged but unlabelled: still say something rather than nothing.
    expect(locationLabel(make({ map_location_approximate: true }))).toBe("Approximate area");
  });
});

describe("against the live catalog", () => {
  const catalog = restaurantsFixture.map((row) => publicRestaurantSchema.parse(row));

  it("finds exactly the three chome-anchored restaurants", () => {
    const approximate = catalog.filter(isApproximateLocation);
    expect(approximate.map((r) => r.place_id).sort()).toEqual(
      [
        "ChIJGZiCSQCPGGARtJeKu6kiMVo", // 牛たんの檸檬 秋葉原店
        "ChIJKdddfwDzGGAR1YfPayuwpFo", // 浜田山叙々苑
        "ChIJt2QEWDmNGGARvJ5tMBSBCqI", // 江戸酒場 海
      ].sort(),
    );
  });

  it("labels every one of them 'Approximate area'", () => {
    for (const restaurant of catalog.filter(isApproximateLocation)) {
      expect(locationLabel(restaurant)).toBe("Approximate area");
    }
  });

  it("leaves the two precisely-located restaurants unlabelled", () => {
    const precise = catalog.filter(
      (row) => row.map_display_eligible && !isApproximateLocation(row),
    );
    expect(precise).toHaveLength(2);
    for (const restaurant of precise) {
      expect(locationLabel(restaurant)).toBeNull();
    }
  });

  it("agrees with the backend's own distance gate", () => {
    for (const restaurant of catalog) {
      if (!restaurant.map_display_eligible) continue;
      expect(isApproximateLocation(restaurant)).toBe(!restaurant.distance_sort_eligible);
    }
  });
});

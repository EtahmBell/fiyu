import { describe, expect, it } from "vitest";

import type { MapRestaurant } from "@/lib/api/schemas";
import {
  belongsToPersonalMapFilter,
  filterPersonalMapRestaurants,
  personalMapMarkerState,
  reconcileDiscoveryExpiry,
} from "@/lib/map/personalMap";

function restaurant(
  placeId: string,
  state: Partial<Pick<MapRestaurant, "is_discovered" | "is_saved" | "is_visited">> = {},
  eligible = true,
): MapRestaurant {
  return {
    place_id: placeId,
    map_display_eligible: eligible,
    is_discovered: false,
    is_saved: false,
    is_visited: false,
    ...state,
  } as MapRestaurant;
}

describe("personal Map membership", () => {
  it("expires discovery independently while retaining saved and visited relationships", () => {
    const now = Date.UTC(2026, 8, 9, 12);
    const expiredSaved = {
      ...restaurant("saved-expired", { is_discovered: true, is_saved: true }),
      discovery_expires_at: new Date(now).toISOString(),
    };
    const expiredVisited = {
      ...restaurant("visited-expired", { is_discovered: true, is_visited: true }),
      discovery_expires_at: new Date(now - 1).toISOString(),
    };
    const reconciled = reconcileDiscoveryExpiry([expiredSaved, expiredVisited], now);

    expect(filterPersonalMapRestaurants(reconciled, "discovered")).toEqual([]);
    expect(filterPersonalMapRestaurants(reconciled, "all").map((row) => row.place_id)).toEqual([
      "visited-expired",
    ]);
    expect(filterPersonalMapRestaurants(reconciled, "saved").map((row) => row.place_id)).toEqual([
      "saved-expired",
    ]);
    expect(filterPersonalMapRestaurants(reconciled, "visited").map((row) => row.place_id)).toEqual([
      "visited-expired",
    ]);
  });

  it.each([
    ["discovered-only", restaurant("d", { is_discovered: true }), [true, false, false, true]],
    ["saved-only", restaurant("s", { is_saved: true }), [false, true, false, false]],
    ["visited-only", restaurant("v", { is_visited: true }), [true, false, true, false]],
    ["saved + discovered", restaurant("sd", { is_saved: true, is_discovered: true }), [true, true, false, true]],
    ["saved + visited", restaurant("sv", { is_saved: true, is_visited: true }), [true, true, true, false]],
    ["discovered + visited", restaurant("dv", { is_discovered: true, is_visited: true }), [true, false, true, true]],
    ["unrevealed", restaurant("u"), [false, false, false, false]],
    ["historical seen-only", restaurant("h"), [false, false, false, false]],
    ["expired + saved", restaurant("es", { is_saved: true }), [false, true, false, false]],
    ["expired + visited", restaurant("ev", { is_visited: true }), [true, false, true, false]],
  ])("applies %s semantics", (_name, item, expected) => {
    expect([
      belongsToPersonalMapFilter(item as MapRestaurant, "all"),
      belongsToPersonalMapFilter(item as MapRestaurant, "saved"),
      belongsToPersonalMapFilter(item as MapRestaurant, "visited"),
      belongsToPersonalMapFilter(item as MapRestaurant, "discovered"),
    ]).toEqual(expected);
  });

  it("excludes an ineligible restaurant from every filter", () => {
    const item = restaurant(
      "blocked",
      { is_discovered: true, is_saved: true, is_visited: true },
      false,
    );
    expect(["all", "saved", "visited", "discovered"].every((filter) =>
      !belongsToPersonalMapFilter(item, filter as "all"),
    )).toBe(true);
  });

  it("defaults to ALL and preserves visited marker precedence", () => {
    const rows = [
      restaurant("discovered", { is_discovered: true }),
      restaurant("saved", { is_saved: true }),
      restaurant("visited", { is_discovered: true, is_saved: true, is_visited: true }),
    ];
    expect(filterPersonalMapRestaurants(rows, "all").map((item) => item.place_id)).toEqual([
      "discovered",
      "visited",
    ]);
    expect(personalMapMarkerState(rows[2])).toBe("visited");
    expect(personalMapMarkerState(rows[1])).toBe("saved");
  });
});

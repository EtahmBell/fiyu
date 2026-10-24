import { describe, expect, it } from "vitest";

import type { MapRestaurant } from "@/lib/api/schemas";
import {
  belongsToPersonalMapFilter,
  filterPersonalMapRestaurants,
  mergeActivePersonalizedPick,
  personalMapMarkerState,
  reconcileDiscoveryExpiry,
} from "@/lib/map/personalMap";

function restaurant(
  placeId: string,
  state: Partial<Pick<
    MapRestaurant,
    "is_discovered" | "is_saved" | "is_visited" | "is_personalized_pick" | "is_my_pick"
  >> = {},
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
      "saved-expired",
      "visited-expired",
    ]);
    expect(filterPersonalMapRestaurants(reconciled, "saved").map((row) => row.place_id)).toEqual([
      "saved-expired",
    ]);
    expect(filterPersonalMapRestaurants(reconciled, "visited").map((row) => row.place_id)).toEqual([
      "visited-expired",
    ]);
    expect(personalMapMarkerState(reconciled[0])).toBe("saved");
    expect(personalMapMarkerState(reconciled[1])).toBe("visited");
  });

  it.each([
    ["discovered-only", restaurant("d", { is_discovered: true }), [true, false, false, true]],
    [
      "unsaved personalized discovery",
      restaurant("p", { is_discovered: true, is_personalized_pick: true }),
      [true, false, false, true],
    ],
    ["saved-only", restaurant("s", { is_saved: true }), [true, true, false, false]],
    ["visited-only", restaurant("v", { is_visited: true }), [true, false, true, false]],
    ["my-pick-only", restaurant("m", { is_my_pick: true }), [true, false, false, false]],
    ["saved + discovered", restaurant("sd", { is_saved: true, is_discovered: true }), [true, true, false, true]],
    ["saved + visited", restaurant("sv", { is_saved: true, is_visited: true }), [true, true, true, false]],
    ["discovered + visited", restaurant("dv", { is_discovered: true, is_visited: true }), [true, false, true, true]],
    ["saved + discovered + visited", restaurant("sdv", { is_discovered: true, is_saved: true, is_visited: true }), [true, true, true, true]],
    ["unrevealed", restaurant("u"), [false, false, false, false]],
    ["historical seen-only", restaurant("h"), [false, false, false, false]],
    ["expired + saved", restaurant("es", { is_saved: true }), [true, true, false, false]],
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

  it("defaults to ALL and gives active discovery precedence over saved and visit history", () => {
    const rows = [
      restaurant("discovered", { is_discovered: true }),
      restaurant("saved", { is_saved: true }),
      restaurant("visited", { is_discovered: true, is_saved: true, is_visited: true }),
    ];
    expect(filterPersonalMapRestaurants(rows, "all").map((item) => item.place_id)).toEqual([
      "discovered",
      "saved",
      "visited",
    ]);
    expect(personalMapMarkerState(rows[2])).toBe("discovered");
    expect(personalMapMarkerState(rows[1])).toBe("saved");
  });

  it.each([
    ["saved only", { is_saved: true }, "saved"],
    ["discovered only", { is_discovered: true }, "discovered"],
    ["saved and discovered", { is_saved: true, is_discovered: true }, "discovered"],
    ["visited only", { is_visited: true }, "visited"],
    ["saved and visited", { is_saved: true, is_visited: true }, "visited"],
    ["My Pick only", { is_my_pick: true }, "my_pick"],
    ["saved My Pick", { is_saved: true, is_my_pick: true }, "my_pick"],
    ["visited My Pick", { is_visited: true, is_my_pick: true }, "my_pick"],
    ["discovered My Pick", { is_discovered: true, is_my_pick: true }, "my_pick"],
    ["discovered and visited", { is_discovered: true, is_visited: true }, "discovered"],
    [
      "saved, discovered, and visited",
      { is_saved: true, is_discovered: true, is_visited: true },
      "discovered",
    ],
    ["no personal relationship", {}, "default"],
  ] as const)("uses one dominant style for %s", (_label, state, expected) => {
    expect(personalMapMarkerState(restaurant("state", state))).toBe(expected);
  });

  it("keeps Personalized Pick treatment separate from canonical Saved and Visited membership", () => {
    const unsavedPick = restaurant("pick", {
      is_discovered: true,
      is_personalized_pick: true,
    });
    const rows = [
      restaurant("discovered", { is_discovered: true }),
      restaurant("saved", { is_saved: true }),
      restaurant("saved-visited", { is_saved: true, is_visited: true }),
    ];

    const unsavedMerged = mergeActivePersonalizedPick(rows, unsavedPick);
    expect(filterPersonalMapRestaurants(unsavedMerged, "saved").map((row) => row.place_id))
      .toEqual(["saved", "saved-visited"]);
    expect(filterPersonalMapRestaurants(unsavedMerged, "visited").map((row) => row.place_id))
      .toEqual(["saved-visited"]);

    const savedPickMerged = mergeActivePersonalizedPick(
      [restaurant("pick", { is_saved: true, is_visited: true })],
      unsavedPick,
    );
    expect(savedPickMerged[0]).toMatchObject({
      place_id: "pick",
      is_personalized_pick: true,
      is_saved: true,
      is_visited: true,
    });
    expect(filterPersonalMapRestaurants(savedPickMerged, "saved")).toHaveLength(1);
    expect(filterPersonalMapRestaurants(savedPickMerged, "visited")).toHaveLength(1);
    expect(filterPersonalMapRestaurants(unsavedMerged, "all").map((row) => row.place_id))
      .toContain("pick");
  });

  it("deduplicates personal places while preserving every relationship flag", () => {
    const merged = mergeActivePersonalizedPick(
      [
        restaurant("multi", { is_saved: true }),
        restaurant("multi", { is_visited: true }),
        restaurant("multi", { is_discovered: true, is_my_pick: true }),
        restaurant("unrelated"),
      ],
      null,
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      place_id: "multi",
      is_discovered: true,
      is_saved: true,
      is_visited: true,
      is_my_pick: true,
    });
    expect(filterPersonalMapRestaurants(merged, "all").map((row) => row.place_id))
      .toEqual(["multi"]);
    expect(filterPersonalMapRestaurants(merged, "saved")).toHaveLength(1);
    expect(filterPersonalMapRestaurants(merged, "visited")).toHaveLength(1);
    expect(filterPersonalMapRestaurants(merged, "discovered")).toHaveLength(1);
    expect(personalMapMarkerState(merged[0])).toBe("my_pick");
  });
});

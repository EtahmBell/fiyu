import type { MapRestaurant, MyPick } from "@fiyu/contracts";

import { restaurantDetailFixture } from "@/test/restaurantFixture";
import { belongsToFilter, expireDiscoveries, MARKER_COLORS, markerState, mayOpenPublicDetail, mergePersonalized } from "./personalMap";

function row(flags: Partial<MapRestaurant> = {}): MapRestaurant {
  return { ...restaurantDetailFixture, is_discovered: false, is_saved: false, is_visited: false, user_rating: null, ...flags } as MapRestaurant;
}

describe("native personal-map semantics", () => {
  it("uses exact semantic colors", () => {
    expect(MARKER_COLORS).toEqual({ personalized: "#C79A32", my_pick: "#8296AA", recent: "#9B8EDB", visited: "#94A69C", saved: "#B88FA5", default: "#9A9490" });
  });

  it.each([
    [{ is_personalized_pick: true, is_my_pick: true, is_discovered: true, is_visited: true, is_saved: true }, "personalized"],
    [{ is_my_pick: true, is_discovered: true, is_visited: true, is_saved: true }, "my_pick"],
    [{ is_discovered: true, is_visited: true, is_saved: true }, "recent"],
    [{ is_visited: true, is_saved: true }, "visited"],
    [{ is_saved: true }, "saved"],
    [{}, "default"],
  ] as const)("applies precedence for %o", (flags, expected) => expect(markerState(row(flags))).toBe(expected));

  it("keeps filter membership independent and requires map readiness", () => {
    const multi = row({ is_saved: true, is_visited: true });
    expect(belongsToFilter(multi, "all")).toBe(true);
    expect(belongsToFilter(multi, "saved")).toBe(true);
    expect(belongsToFilter(multi, "visited")).toBe(true);
    expect(belongsToFilter({ ...multi, latitude: null }, "all")).toBe(false);
  });

  it("deduplicates personalized state without dropping saved and visited flags", () => {
    const base = row({ is_saved: true, is_visited: true });
    const merged = mergePersonalized([base], row({ place_id: base.place_id, is_personalized_pick: true }));
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ is_saved: true, is_visited: true, is_personalized_pick: true });
  });

  it("expires recent discovery exactly at its boundary", () => {
    const recent = row({ is_discovered: true, discovery_expires_at: "2026-10-25T10:00:00Z" });
    expect(expireDiscoveries([recent], Date.parse("2026-10-25T09:59:59Z"))[0].is_discovered).toBe(true);
    expect(expireDiscoveries([recent], Date.parse("2026-10-25T10:00:00Z"))[0].is_discovered).toBe(false);
  });

  it("never opens a private My Pick through the public route", () => {
    const myPick = row({ is_my_pick: true });
    expect(mayOpenPublicDetail(myPick, undefined)).toBe(false);
    expect(mayOpenPublicDetail(myPick, [{ place_id: myPick.place_id, is_public: false } as MyPick])).toBe(false);
    expect(mayOpenPublicDetail(myPick, [{ place_id: myPick.place_id, is_public: true } as MyPick])).toBe(true);
    expect(mayOpenPublicDetail(row(), undefined)).toBe(true);
  });
});

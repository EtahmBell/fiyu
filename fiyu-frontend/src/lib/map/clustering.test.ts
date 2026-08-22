import { describe, expect, it } from "vitest";

import { publicRestaurantSchema } from "@/lib/api/schemas";
import { mappableRestaurants } from "@/lib/geo/mappable";
import { BASE_CELL_SIZE, type ClusterInput, clusterMarkers, individualMarkers, isCluster } from "@/lib/map/clustering";
import { project } from "@/lib/map/projection";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

function input(id: string, x: number, y: number): ClusterInput<string> {
  return { id, point: { x, y }, item: id };
}

describe("clusterMarkers", () => {
  it("returns nothing for no markers", () => {
    expect(clusterMarkers([])).toEqual([]);
  });

  it("keeps well-separated markers as singles", () => {
    const clusters = clusterMarkers([input("a", 100, 100), input("b", 800, 800)]);
    expect(clusters).toHaveLength(2);
    expect(clusters.every((cluster) => !isCluster(cluster))).toBe(true);
  });

  it("groups markers that would overlap", () => {
    const clusters = clusterMarkers([
      input("a", 100, 100),
      input("b", 110, 105),
      input("c", 120, 108),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(3);
    expect(isCluster(clusters[0])).toBe(true);
  });

  it("places a cluster at the centroid of its members", () => {
    // Both inside cell (1,3) at the default 64-unit grid.
    const clusters = clusterMarkers([input("a", 100, 200), input("b", 120, 220)]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].point).toEqual({ x: 110, y: 210 });
  });

  it("breaks clusters apart as the map zooms in", () => {
    // Same cell at 64 units, different cells once the grid shrinks to 16.
    const markers = [input("a", 70, 70), input("b", 100, 100)];
    expect(clusterMarkers(markers, { scale: 1 })).toHaveLength(1);
    expect(clusterMarkers(markers, { scale: 4 })).toHaveLength(2);
  });

  it("is grid-based, so proximity alone does not guarantee grouping", () => {
    // Documents a real limitation: two markers close together but either side
    // of a cell boundary render separately. Acceptable because cells are wider
    // than a marker, so the visual overlap this prevents is the common case.
    const straddling = [input("a", BASE_CELL_SIZE - 1, 10), input("b", BASE_CELL_SIZE + 1, 10)];
    expect(clusterMarkers(straddling, { scale: 1 })).toHaveLength(2);
  });

  it("never drops a marker, whatever the zoom", () => {
    const markers = Array.from({ length: 40 }, (_, index) =>
      input(`m${index}`, (index % 8) * 30, Math.floor(index / 8) * 30),
    );
    for (const scale of [1, 1.5, 2, 3, 4]) {
      const total = clusterMarkers(markers, { scale }).reduce(
        (sum, cluster) => sum + cluster.members.length,
        0,
      );
      expect(total).toBe(markers.length);
    }
  });

  it("is deterministic, so server and client render the same keys", () => {
    const markers = [input("a", 100, 100), input("b", 105, 105), input("c", 600, 600)];
    const first = clusterMarkers(markers, { scale: 1 });
    const second = clusterMarkers(markers, { scale: 1 });
    expect(first.map((c) => c.id)).toEqual(second.map((c) => c.id));
  });

  it("gives a single marker the marker's own id, so keys stay stable", () => {
    expect(clusterMarkers([input("only", 10, 10)])[0].id).toBe("only");
  });

  it("treats scale below 1 as 1 rather than exploding the cell size", () => {
    const markers = [input("a", 100, 100), input("b", 110, 100)];
    expect(clusterMarkers(markers, { scale: 0 })).toEqual(clusterMarkers(markers, { scale: 1 }));
  });

  it("carries the original item through untouched", () => {
    const clusters = clusterMarkers([{ id: "x", point: { x: 1, y: 1 }, item: { name: "Bar" } }]);
    expect(clusters[0].members[0].item).toEqual({ name: "Bar" });
  });
});

describe("individualMarkers", () => {
  it("keeps nearby distinct coordinates as separate place-id entities", () => {
    const markers = [input("a", 100, 100), input("b", 101, 101), input("c", 102, 102)];
    const result = individualMarkers(markers);
    expect(result.map((marker) => marker.id)).toEqual(["a", "b", "c"]);
    expect(result.every((marker) => marker.members.length === 1)).toBe(true);
    expect(result.map((marker) => marker.point)).toEqual(markers.map((marker) => marker.point));
  });

  it("deterministically separates exact-coordinate collisions without merging IDs", () => {
    const markers = [input("b", 100, 100), input("a", 100, 100), input("c", 100, 100)];
    const first = individualMarkers(markers, { scale: 2 });
    const second = individualMarkers(markers, { scale: 2 });
    expect(first).toEqual(second);
    expect(new Set(first.map((marker) => `${marker.point.x}:${marker.point.y}`)).size).toBe(3);
    expect(first.map((marker) => marker.id)).toEqual(["b", "a", "c"]);
  });
});

describe("cluster counts are not a popularity signal", () => {
  it("depends only on geometry and zoom, never on the item", () => {
    // Two identical layouts with different payloads must cluster identically.
    const layoutA = [input("a", 100, 100), input("b", 105, 105)];
    const layoutB = [input("c", 100, 100), input("d", 105, 105)];
    expect(clusterMarkers(layoutA)[0].members).toHaveLength(
      clusterMarkers(layoutB)[0].members.length,
    );
  });
});

describe("against the live catalog", () => {
  const catalog = restaurantsFixture.map((row) => publicRestaurantSchema.parse(row));
  const projected = mappableRestaurants(catalog).map((restaurant) => ({
    id: restaurant.place_id,
    point: project({ lat: restaurant.latitude, lng: restaurant.longitude }),
    item: restaurant,
  }));

  it("never loses or duplicates a restaurant, at any zoom", () => {
    // Asserting total membership rather than a mark count: how many marks appear
    // is incidental layout, but every restaurant must be reachable at every zoom.
    for (const scale of [1, 1.5, 1.7768514, 2, 2.665, 3, 4]) {
      const clusters = clusterMarkers(projected, { scale });
      const ids = clusters.flatMap((cluster) => cluster.members.map((member) => member.id));
      expect(ids).toHaveLength(projected.length);
      expect(new Set(ids).size).toBe(projected.length);
    }
  });

  /**
   * あたらよ 秋葉原店 and 牛たんの檸檬 秋葉原店 are ~350 m apart in 神田佐久間町.
   * They overlap at the initial fit and must stack rather than be drawn on top
   * of one another, then separate as the map zooms in. Pinned so a future
   * BASE_CELL_SIZE change that un-stacks an overlapping pair fails loudly.
   */
  it("stacks the two Akihabara restaurants at the initial fit and splits them on zoom", () => {
    const akihabara = ["ChIJAZOKBEyPGGARWoSCCwgRm8E", "ChIJGZiCSQCPGGARtJeKu6kiMVo"];

    const fitted = clusterMarkers(projected, { scale: 1.7768514 });
    const shared = fitted.find((cluster) => cluster.members.length > 1);
    expect(shared?.members.map((member) => member.id).sort()).toEqual([...akihabara].sort());

    const zoomed = clusterMarkers(projected, { scale: 2.665 });
    expect(zoomed.every((cluster) => cluster.members.length === 1)).toBe(true);
  });

  it("positions a stacked group at its members' centroid, never jittered", () => {
    const clusters = clusterMarkers(projected, { scale: 1.7768514 });
    const shared = clusters.find((cluster) => cluster.members.length > 1);
    const meanX =
      shared!.members.reduce((total, member) => total + member.point.x, 0) /
      shared!.members.length;
    // Rounded to the SVG grid, but derived from the members and nothing else.
    expect(shared!.point.x).toBeCloseTo(meanX, 1);
  });

  it("rounds every cluster point for rendering", () => {
    for (const cluster of clusterMarkers(projected, { scale: 1.7768514 })) {
      expect(String(cluster.point.x)).toMatch(/^-?\d+(\.\d{1,2})?$/);
      expect(String(cluster.point.y)).toMatch(/^-?\d+(\.\d{1,2})?$/);
    }
  });
});

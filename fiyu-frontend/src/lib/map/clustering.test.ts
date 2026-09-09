import { describe, expect, it } from "vitest";

import { publicRestaurantSchema } from "@/lib/api/schemas";
import { mappableRestaurants } from "@/lib/geo/mappable";
import {
  BASE_CELL_SIZE,
  type ClusterInput,
  clusterExpansionScale,
  clusterLevelForScale,
  clusterMarkers,
  individualMarkers,
  isCluster,
  planClusterExpansion,
  spiderfyMarkers,
} from "@/lib/map/clustering";
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

  it("is identical for shuffled input, including member order, IDs and centroids", () => {
    const markers = [
      input("c", 108, 104),
      input("a", 100, 100),
      input("d", 700, 700),
      input("b", 104, 102),
    ];
    const expected = clusterMarkers(markers, { scale: 2.1 });
    const shuffled = clusterMarkers([markers[2], markers[0], markers[3], markers[1]], {
      scale: 2.4,
    });

    expect(shuffled).toEqual(expected);
    expect(expected[0].id).toBe("cluster:a|b|c");
  });

  it("uses deliberate scale buckets and restores the exact prior partition", () => {
    const markers = [input("a", 34, 34), input("b", 60, 60)];
    const levelTwo = clusterMarkers(markers, { scale: 2.1 });
    expect(clusterMarkers(markers, { scale: 2.49 })).toEqual(levelTwo);

    const levelThree = clusterMarkers(markers, { scale: 2.5 });
    expect(levelThree).not.toEqual(levelTwo);
    expect(clusterMarkers(markers, { scale: 2.1 })).toEqual(levelTwo);
  });

  it("has no interaction-history input: different scale sequences converge identically", () => {
    const markers = [
      input("a", 34, 34),
      input("b", 60, 60),
      input("c", 400, 400),
    ];
    // Sequence A: pan (which never enters this API), zoom in, then zoom out.
    clusterMarkers(markers, { scale: 3.2 });
    const sequenceA = clusterMarkers(markers, { scale: 1.8 });
    // Sequence B: visit other levels in another order and return to the same one.
    clusterMarkers(markers, { scale: 1 });
    clusterMarkers(markers, { scale: 4 });
    const sequenceB = clusterMarkers([...markers].reverse(), { scale: 2.2 });

    expect(sequenceB).toEqual(sequenceA);
  });

  it("clusters a filtered account subset independently of the source ordering", () => {
    const all = [input("a", 100, 100), input("b", 105, 105), input("c", 110, 110)];
    const filtered = all.filter((marker) => marker.id !== "b");
    expect(clusterMarkers(filtered, { scale: 1 })).toEqual(
      clusterMarkers([filtered[1], filtered[0]], { scale: 1 }),
    );
  });

  it("applies a documented fixed-cell rule to transitive proximity", () => {
    const markers = [input("a", 10, 10), input("b", 30, 10), input("c", 65, 10)];
    const clusters = clusterMarkers(markers, { scale: 1 });
    expect(clusters.map((cluster) => cluster.members.map((member) => member.id))).toEqual([
      ["c"],
      ["a", "b"],
    ]);
    expect(clusterMarkers([markers[2], markers[1], markers[0]], { scale: 1 })).toEqual(clusters);
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

describe("clusterLevelForScale", () => {
  it("maps the custom 1..4 camera scale to four stable levels", () => {
    expect(clusterLevelForScale(1)).toBe(1);
    expect(clusterLevelForScale(1.49)).toBe(1);
    expect(clusterLevelForScale(1.5)).toBe(2);
    expect(clusterLevelForScale(2.49)).toBe(2);
    expect(clusterLevelForScale(2.5)).toBe(3);
    expect(clusterLevelForScale(3.5)).toBe(4);
    expect(clusterLevelForScale(4)).toBe(4);
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

describe("clusterExpansionScale", () => {
  it("keeps distinct points canonical even when max zoom cannot fully separate their visuals", () => {
    const members = [input("a", 63, 100), input("b", 65, 100)];
    expect(clusterMarkers(members, { scale: 1 })).toHaveLength(2);
    expect(clusterExpansionScale(members, { currentScale: 1, maxScale: 4 })).toBe(4);
  });

  it("selects a single zoom that makes nearby pins visibly separate", () => {
    const members = [input("a", 100, 100), input("b", 120, 100)];
    expect(clusterExpansionScale(members, { currentScale: 1, maxScale: 4 })).toBe(2.5);
  });

  it("returns null for effectively coincident markers so the chooser can open", () => {
    const members = [input("a", 100, 100), input("b", 100, 100)];
    expect(clusterExpansionScale(members, { currentScale: 1, maxScale: 4 })).toBeNull();
  });

  it("uses the requested meaningful scale even when the display grid has not split", () => {
    const members = [input("a", 100, 100), input("b", 120, 100)];
    const target = clusterExpansionScale(members, {
      currentScale: 1,
      maxScale: 4,
      minimumScale: 2,
    });

    expect(target).not.toBeNull();
    expect(target as number).toBeGreaterThanOrEqual(2);
    expect(planClusterExpansion(members, {
      currentScale: 1,
      maxScale: 4,
      minimumScale: 2,
    }).mode).toBe("separable");
  });

  it("targets a stable level where separable leaves remain naturally individual", () => {
    const members = [input("a", 100, 100), input("b", 120, 100)];
    const plan = planClusterExpansion(members, {
      currentScale: 1,
      maxScale: 4,
      minimumScale: 2,
    });

    expect(clusterMarkers(members, { scale: plan.targetScale })).toHaveLength(2);
    expect(plan).toEqual({ mode: "separable", targetScale: 2.5 });
  });

  it("freezes spiderfy only for coordinates that render at the same canonical point", () => {
    expect(planClusterExpansion(
      [input("a", 100, 100), input("b", 100, 100)],
      { currentScale: 1, maxScale: 4 },
    )).toEqual({ mode: "spiderfy", targetScale: 4 });

    expect(planClusterExpansion(
      [input("a", 100, 100), input("b", 101, 100)],
      { currentScale: 1, maxScale: 4 },
    )).toEqual({ mode: "separable", targetScale: 4 });

    expect(planClusterExpansion(
      [input("a", 100.001, 100.001), input("b", 100.004, 100.004)],
      { currentScale: 1, maxScale: 4 },
    )).toEqual({ mode: "spiderfy", targetScale: 4 });
  });
});

describe("spiderfyMarkers", () => {
  it("fans coincident points around their canonical anchor deterministically", () => {
    const members = [input("b", 100, 100), input("a", 100, 100), input("c", 100, 100)];
    const first = spiderfyMarkers(members, { scale: 4 });
    const second = spiderfyMarkers(members, { scale: 4 });

    expect(first).toEqual(second);
    expect(first.map((marker) => marker.id)).toEqual(["a", "b", "c"]);
    expect(new Set(first.map((marker) => `${marker.point.x}:${marker.point.y}`)).size).toBe(3);
    expect(first.every((marker) => marker.members.length === 1)).toBe(true);
  });

  it("keeps the radial fan a stable screen-space size as the map scale changes", () => {
    const members = [input("a", 100, 100), input("b", 100, 100)];
    const atTwo = spiderfyMarkers(members, { scale: 2 });
    const atFour = spiderfyMarkers(members, { scale: 4 });
    const separation = (markers: ReturnType<typeof spiderfyMarkers<string>>, scale: number) =>
      Math.hypot(
        markers[0].point.x - markers[1].point.x,
        markers[0].point.y - markers[1].point.y,
      ) * scale;

    expect(separation(atTwo, 2)).toBeCloseTo(separation(atFour, 4), 1);
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

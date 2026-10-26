import { clusterMarkers, spiderfyMarkers } from "./clustering";

const input = (id: string, x: number, y: number) => ({ id, point: { x, y }, item: id });
describe("native map clustering", () => {
  it("is deterministic across source order and reports the exact count", () => {
    const rows = [input("b", 12, 12), input("a", 10, 10), input("c", 300, 300)];
    expect(clusterMarkers(rows, 1)).toEqual(clusterMarkers([...rows].reverse(), 1));
    expect(clusterMarkers(rows, 1).find((cluster) => cluster.members.length === 2)?.id).toBe("cluster:a|b");
  });
  it("expands nearby markers as zoom rises", () => {
    const rows = [input("a", 10, 10), input("b", 45, 10)];
    expect(clusterMarkers(rows, 1)).toHaveLength(1);
    expect(clusterMarkers(rows, 3)).toHaveLength(2);
  });
  it("spiderfies coincident markers deterministically and keeps each touchable leaf", () => {
    const rows = [input("b", 10, 10), input("a", 10, 10)];
    const leaves = spiderfyMarkers(rows, 4);
    expect(leaves.map((leaf) => leaf.id)).toEqual(["a", "b"]);
    expect(new Set(leaves.map((leaf) => `${leaf.point.x}:${leaf.point.y}`)).size).toBe(2);
  });
});

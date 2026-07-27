import type { Point } from "@/lib/map/projection";

/**
 * Grid clustering for map markers.
 *
 * Markers are bucketed into square cells in viewBox space. The cell size is
 * divided by the current scale, so zooming in loosens clustering naturally and
 * clusters break apart into individual pins.
 *
 * A cluster's count is a rendering detail, not a signal: it reports how many
 * markers overlap at the current zoom and says nothing about how good or how
 * busy those restaurants are. Nothing here may be used to imply popularity.
 */

export interface ClusterInput<T> {
  id: string;
  point: Point;
  item: T;
}

export interface MarkerCluster<T> {
  /** Stable across renders at a given zoom, so React keys do not thrash. */
  id: string;
  /** Centroid of the members, in viewBox units. */
  point: Point;
  members: ClusterInput<T>[];
}

/** Cell size at k = 1, in viewBox units. Roughly a marker's footprint. */
export const BASE_CELL_SIZE = 64;

export interface ClusterOptions {
  /** Current map scale. Higher zoom -> smaller cells -> fewer clusters. */
  scale?: number;
  baseCellSize?: number;
}

/**
 * Group markers that would otherwise overlap.
 *
 * Single-member groups are returned as clusters of one; the caller decides to
 * render those as ordinary pins. Ordering is deterministic (by cell, then by
 * input order) so server and client render identically.
 */
export function clusterMarkers<T>(
  inputs: readonly ClusterInput<T>[],
  options: ClusterOptions = {},
): MarkerCluster<T>[] {
  const scale = Math.max(1, options.scale ?? 1);
  const cellSize = Math.max(1, (options.baseCellSize ?? BASE_CELL_SIZE) / scale);

  const cells = new Map<string, ClusterInput<T>[]>();
  const order: string[] = [];

  for (const input of inputs) {
    const column = Math.floor(input.point.x / cellSize);
    const row = Math.floor(input.point.y / cellSize);
    const key = `${column}:${row}`;
    const existing = cells.get(key);
    if (existing) {
      existing.push(input);
    } else {
      cells.set(key, [input]);
      order.push(key);
    }
  }

  return order.map((key) => {
    const members = cells.get(key) as ClusterInput<T>[];
    const sumX = members.reduce((total, member) => total + member.point.x, 0);
    const sumY = members.reduce((total, member) => total + member.point.y, 0);
    return {
      // Keyed by the first member so a cluster keeps its identity as
      // neighbours join or leave it.
      id: members.length === 1 ? members[0].id : `cluster:${members[0].id}:${members.length}`,
      point: { x: sumX / members.length, y: sumY / members.length },
      members,
    };
  });
}

export function isCluster<T>(cluster: MarkerCluster<T>): boolean {
  return cluster.members.length > 1;
}

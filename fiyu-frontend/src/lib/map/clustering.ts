import { type Point, roundPoint } from "@/lib/map/projection";

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

export interface ClusterExpansionOptions {
  currentScale: number;
  maxScale: number;
  /** Do not return a technically split but visually negligible zoom target. */
  minimumScale?: number;
  /** Minimum centre-to-centre distance needed for two full-size pins to read separately. */
  minimumSeparation?: number;
  step?: number;
}

export interface ClusterExpansionPlan {
  mode: "separable" | "spiderfy";
  targetScale: number;
}

export interface IndividualMarkerOptions {
  /** Current map scale; keeps display-only collision separation visually stable. */
  scale?: number;
  collisionRadius?: number;
}

export interface SpiderfyMarkerOptions {
  /** Current map scale; converts the screen-space fan radius to map units. */
  scale?: number;
  radius?: number;
}

/**
 * Preserve one rendered entity per restaurant while separating only exact
 * coordinate collisions. The canonical coordinate is never changed: the small
 * offset is a deterministic display fallback keyed by restaurant ID.
 */
export function individualMarkers<T>(
  inputs: readonly ClusterInput<T>[],
  options: IndividualMarkerOptions = {},
): MarkerCluster<T>[] {
  const scale = Math.max(1, options.scale ?? 1);
  const collisionRadius = Math.max(1, options.collisionRadius ?? 24) / scale;
  const coincident = new Map<string, ClusterInput<T>[]>();

  for (const input of inputs) {
    const key = `${input.point.x}:${input.point.y}`;
    const group = coincident.get(key);
    if (group) group.push(input);
    else coincident.set(key, [input]);
  }

  const displayPointById = new Map<string, Point>();
  for (const group of coincident.values()) {
    if (group.length === 1) {
      displayPointById.set(group[0].id, group[0].point);
      continue;
    }
    const ordered = [...group].sort((left, right) => left.id.localeCompare(right.id));
    ordered.forEach((input, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / ordered.length;
      displayPointById.set(
        input.id,
        roundPoint({
          x: input.point.x + Math.cos(angle) * collisionRadius,
          y: input.point.y + Math.sin(angle) * collisionRadius,
        }),
      );
    });
  }

  return inputs.map((input) => ({
    id: input.id,
    point: displayPointById.get(input.id) ?? input.point,
    members: [input],
  }));
}

/**
 * Fan one otherwise unseparable cluster into deterministic display-only pins.
 * Canonical coordinates and item data remain untouched.
 */
export function spiderfyMarkers<T>(
  inputs: readonly ClusterInput<T>[],
  options: SpiderfyMarkerOptions = {},
): MarkerCluster<T>[] {
  if (inputs.length < 2) return individualMarkers(inputs, options);

  const scale = Math.max(1, options.scale ?? 1);
  const radius = Math.max(1, options.radius ?? 30) / scale;
  const anchor = roundPoint({
    x: inputs.reduce((sum, input) => sum + input.point.x, 0) / inputs.length,
    y: inputs.reduce((sum, input) => sum + input.point.y, 0) / inputs.length,
  });
  const ordered = [...inputs].sort((left, right) => left.id.localeCompare(right.id));

  return ordered.map((input, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / ordered.length;
    return {
      id: input.id,
      point: roundPoint({
        x: anchor.x + Math.cos(angle) * radius,
        y: anchor.y + Math.sin(angle) * radius,
      }),
      members: [input],
    };
  });
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
    // The one place a float difference could change STRUCTURE (which markers
    // group together) rather than just a coordinate, if a point sat exactly on a
    // cell boundary. Bounded in practice: `scale` arrives already rounded from
    // clampTranslate, and callers project through roundPoint.
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
      // Rounded here because this feeds cx/cy directly in MapMarkers.
      point: roundPoint({ x: sumX / members.length, y: sumY / members.length }),
      members,
    };
  });
}

/**
 * Find one intentional zoom level where canonical marker positions are
 * visually separated. Structural grid cells are a rendering optimization and
 * must not decide whether real coordinates need display-only offsets.
 */
export function clusterExpansionScale<T>(
  members: readonly ClusterInput<T>[],
  options: ClusterExpansionOptions,
): number | null {
  const plan = planClusterExpansion(members, options);
  return plan.mode === "separable" ? plan.targetScale : null;
}

/**
 * Freeze the interaction mode and target before camera motion begins.
 *
 * Grid-cell membership is deliberately irrelevant here. A pair can remain in
 * one clustering cell at maximum zoom while still representing two distinct
 * real locations. Spiderfy is reserved for canonical coordinates that render
 * at the same SVG point; merely being close is never enough to replace real
 * geography with a radial display offset.
 */
export function planClusterExpansion<T>(
  members: readonly ClusterInput<T>[],
  options: ClusterExpansionOptions,
): ClusterExpansionPlan {
  if (members.length < 2) {
    return { mode: "spiderfy", targetScale: options.maxScale };
  }
  const step = Math.max(0.05, options.step ?? 0.25);
  const minimumSeparation = Math.max(1, options.minimumSeparation ?? BASE_CELL_SIZE * 0.375);
  const start = Math.min(
    options.maxScale,
    Math.max(1, options.currentScale + step, options.minimumScale ?? 1),
  );

  let requiredScale = start;
  for (let left = 0; left < members.length; left += 1) {
    for (let right = left + 1; right < members.length; right += 1) {
      const leftPoint = roundPoint(members[left].point);
      const rightPoint = roundPoint(members[right].point);
      const canonicalDistance = Math.hypot(
        leftPoint.x - rightPoint.x,
        leftPoint.y - rightPoint.y,
      );
      if (canonicalDistance === 0) {
        return { mode: "spiderfy", targetScale: options.maxScale };
      }
      requiredScale = Math.max(requiredScale, minimumSeparation / canonicalDistance);
    }
  }

  const steppedScale = start + Math.ceil(Math.max(0, requiredScale - start) / step) * step;
  return {
    mode: "separable",
    targetScale: Math.min(options.maxScale, steppedScale),
  };
}

export function isCluster<T>(cluster: MarkerCluster<T>): boolean {
  return cluster.members.length > 1;
}

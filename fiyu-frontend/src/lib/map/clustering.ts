import { type Point, roundPoint } from "@/lib/map/projection";

/**
 * Grid clustering for map markers.
 *
 * Markers are bucketed into globally anchored square cells in viewBox space.
 * The cell size is divided by a stable integer cluster level, so fractional
 * camera frames never regroup restaurants. The complete active-filter dataset
 * is partitioned; viewport clipping is deliberately not part of this module.
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

function compareStableIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Cell size at k = 1, in viewBox units. Roughly a marker's footprint. */
export const BASE_CELL_SIZE = 64;

/**
 * The SVG camera uses a linear 1..4 magnification rather than slippy-map zoom.
 * Clustering therefore has four deliberate levels, selected at the midpoint
 * between integer magnifications:
 *
 *   [1, 1.5)   -> 1 (whole-city)
 *   [1.5, 2.5) -> 2
 *   [2.5, 3.5) -> 3
 *   [3.5, 4]   -> 4 (neighbourhood)
 *
 * A fractional animation frame never creates a new grid size.
 */
export function clusterLevelForScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(4, Math.max(1, Math.floor(Math.max(1, scale) + 0.5)));
}

/** Smallest camera scale that deterministically belongs to a cluster level. */
function scaleForClusterLevel(level: number): number {
  return level <= 1 ? 1 : level - 0.5;
}

export interface ClusterOptions {
  /** Camera scale, quantized to a stable cluster level before use. */
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
      displayPointById.set(group[0].id, roundPoint(group[0].point));
      continue;
    }
    const ordered = [...group].sort((left, right) => compareStableIds(left.id, right.id));
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
    point: displayPointById.get(input.id) ?? roundPoint(input.point),
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
  const ordered = [...inputs].sort((left, right) => compareStableIds(left.id, right.id));

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
 * render those as ordinary pins. This is a fixed-cell rule, not a greedy
 * proximity graph: transitive neighbours group only when their canonical
 * points occupy the same globally anchored cell. Input and output are sorted
 * by stable IDs so membership, centroid arithmetic and React keys are invariant
 * to source order.
 */
export function clusterMarkers<T>(
  inputs: readonly ClusterInput<T>[],
  options: ClusterOptions = {},
): MarkerCluster<T>[] {
  const level = clusterLevelForScale(options.scale ?? 1);
  const cellSize = Math.max(1, (options.baseCellSize ?? BASE_CELL_SIZE) / level);

  const cells = new Map<string, ClusterInput<T>[]>();
  const orderedInputs = [...inputs].sort((left, right) => compareStableIds(left.id, right.id));

  for (const input of orderedInputs) {
    // The one place a float difference could change STRUCTURE (which markers
    // group together) rather than just a coordinate, if a point sat exactly on a
    // cell boundary. Bounded in practice: `scale` arrives already rounded from
    // clampTranslate, and callers project through roundPoint.
    const renderedPoint = roundPoint(input.point);
    // At maximum useful zoom, real distinct places are always individually
    // addressable; only coordinates that render at the exact same point remain
    // grouped so the existing explicit spiderfy interaction can resolve them.
    const key = level === 4
      ? `point:${renderedPoint.x}:${renderedPoint.y}`
      : `cell:${Math.floor(renderedPoint.x / cellSize)}:${Math.floor(renderedPoint.y / cellSize)}`;
    const existing = cells.get(key);
    if (existing) {
      existing.push(input);
    } else {
      cells.set(key, [input]);
    }
  }

  return [...cells.values()].map((members) => {
    const sumX = members.reduce((total, member) => total + member.point.x, 0);
    const sumY = members.reduce((total, member) => total + member.point.y, 0);
    const memberIds = members.map((member) => member.id);
    return {
      // Identity comes from the complete sorted membership, never input order,
      // a transient centroid or creation sequence.
      id: members.length === 1 ? members[0].id : `cluster:${memberIds.join("|")}`,
      // Rounded here because this feeds cx/cy directly in MapMarkers.
      point: roundPoint({ x: sumX / members.length, y: sumY / members.length }),
      members,
    };
  }).sort((left, right) => compareStableIds(left.id, right.id));
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

  // A separable activation must finish at a stable clustering level where its
  // leaves are naturally individual. Otherwise clearing the temporary
  // activation after a later pan would recreate the cluster at the same zoom,
  // making the partition depend on interaction history.
  const finalLevel = clusterLevelForScale(options.maxScale);
  let stableSeparationScale = options.maxScale;
  for (let level = clusterLevelForScale(start); level <= finalLevel; level += 1) {
    if (clusterMarkers(members, { scale: level }).every((cluster) => cluster.members.length === 1)) {
      stableSeparationScale = Math.max(start, scaleForClusterLevel(level));
      break;
    }
  }

  const neededScale = Math.max(requiredScale, stableSeparationScale);
  const steppedScale = start + Math.ceil(Math.max(0, neededScale - start) / step) * step;
  return {
    mode: "separable",
    targetScale: Math.min(options.maxScale, steppedScale),
  };
}

export function isCluster<T>(cluster: MarkerCluster<T>): boolean {
  return cluster.members.length > 1;
}

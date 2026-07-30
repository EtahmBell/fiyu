import { MAX_SCALE, MIN_SCALE } from "@/lib/map/viewport";

/**
 * Zoom-dependent detail levels.
 *
 * WHY BUCKETS RATHER THAN A CONTINUOUS SCALE. The base geography is thousands of
 * SVG paths. If a layer's visibility were a function of the raw scale, every
 * wheel tick and every pixel of a pinch would produce a new value, React would
 * reconcile the whole basemap, and dragging would stutter while the restaurant
 * pins -- the thing that actually matters -- fought for the same frames.
 *
 * Bucketing collapses the continuous scale to one of three integers. Panning
 * never changes it. Zooming changes it at most twice across the whole range. The
 * basemap memoises on the bucket, so it re-renders three times in a session
 * rather than on every frame.
 *
 * Stroke widths are handled separately, by `vector-effect="non-scaling-stroke"`
 * in the layer components: the browser keeps them visually constant under the
 * transform, so they need no scale-derived arithmetic at all. Between the two,
 * nothing in the base geography depends on the exact zoom.
 */

/**
 * 1 = city overview, 2 = district, 3 = street context.
 *
 * A feature declares the lowest level it appears at, so detail is additive:
 * anything visible at 1 stays visible at 2 and 3.
 */
export type DetailLevel = 1 | 2 | 3;

/**
 * Scale at which each level begins.
 *
 * Chosen against the zoom control's 1.5x step so a single press moves the level
 * predictably: from the default 1, two presses reach 2.25 (level 2) and three
 * reach 3.375 (level 3). The initial auto-fit for the current catalog lands
 * around 1.78, which is deliberately still level 1 -- opening the map should show
 * the calm overview, not the dense view.
 */
export const DETAIL_THRESHOLDS: Readonly<Record<DetailLevel, number>> = {
  1: MIN_SCALE,
  2: 2.0,
  3: 3.0,
};

/** The detail level for a map scale. Total, and monotonic in `scale`. */
export function detailLevelFor(scale: number): DetailLevel {
  if (!Number.isFinite(scale)) return 1;
  if (scale >= DETAIL_THRESHOLDS[3]) return 3;
  if (scale >= DETAIL_THRESHOLDS[2]) return 2;
  return 1;
}

/** True when a feature declaring `minDetail` should be drawn at `level`. */
export function isVisibleAt(minDetail: DetailLevel, level: DetailLevel): boolean {
  return minDetail <= level;
}

/**
 * Human description of the current level, for the map's status text.
 *
 * Announced politely rather than as an alert: it is orientation, not an event.
 */
export function detailLevelLabel(level: DetailLevel): string {
  switch (level) {
    case 1:
      return "City overview";
    case 2:
      return "District detail";
    case 3:
      return "Street detail";
  }
}

/** Every level, for tests and for iterating layer definitions. */
export const DETAIL_LEVELS: readonly DetailLevel[] = [1, 2, 3];

/**
 * Guard used by tests: the thresholds must stay inside the scale range, or a
 * level would be unreachable and its layers dead code.
 */
export function thresholdsAreReachable(): boolean {
  return DETAIL_LEVELS.every(
    (level) =>
      DETAIL_THRESHOLDS[level] >= MIN_SCALE && DETAIL_THRESHOLDS[level] <= MAX_SCALE,
  );
}

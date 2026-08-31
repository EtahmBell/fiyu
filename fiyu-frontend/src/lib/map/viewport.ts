import {
  type Point,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
  project,
  svgNumber,
} from "@/lib/map/projection";
import type { LatLng } from "@/lib/map/projection";

/**
 * Pan and zoom state for the discovery map.
 *
 * The map is an SVG with a fixed viewBox and a single transformed group:
 *
 *   <g transform="translate(x y) scale(k)">
 *
 * so a content point p appears at screen position `p * k + t`. Everything here
 * is pure maths on that transform -- no DOM, no refs -- which is what makes pan
 * bounds, zoom limits and fitting testable without a browser.
 *
 * Because all geometry lives in viewBox units, resizing the container cannot
 * cause coordinate drift: the browser rescales the whole coordinate system and
 * the transform is unchanged.
 */

export interface MapView {
  /** Translate in viewBox units. */
  x: number;
  y: number;
  /** Uniform scale factor. */
  k: number;
}

export interface ViewInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** k = 1 shows the whole of Tokyo; 4 is roughly neighbourhood level. */
export const MIN_SCALE = 1;
export const MAX_SCALE = 4;

/** Step applied by the + and - buttons. */
export const ZOOM_STEP = 1.5;

export const IDENTITY_VIEW: MapView = { x: 0, y: 0, k: 1 };

/**
 * Non-finite input resets to MIN_SCALE rather than clamping to MAX: if state
 * is corrupt, showing the whole map is recoverable whereas being dropped at
 * maximum zoom is disorienting.
 */
export function clampScale(k: number): number {
  if (!Number.isFinite(k)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));
}

/**
 * Decimal places kept on the scale factor.
 *
 * Finer than SVG_DECIMALS on purpose. `k` is multiplied by every coordinate and
 * divides every stroke width, and the zoom buttons step by 1.5 / (1/1.5), so 2dp
 * here would accumulate visible drift over a few zoom-outs. 1e-6 still swamps
 * the ~1e-16 engine divergence it exists to remove.
 */
export const SCALE_DECIMALS = 6;

const SCALE_QUANTUM = 10 ** SCALE_DECIMALS;

function roundScale(k: number): number {
  return Math.round(k * SCALE_QUANTUM) / SCALE_QUANTUM;
}

/**
 * Constrain the translation so the content always covers the viewport.
 *
 * At k = 1 the only valid translation is 0, so the map cannot be dragged away
 * and lost. At k > 1 the translation is bounded by the overhang on each axis.
 *
 * Every view-producing function in this module funnels through here, so this is
 * also where view numbers are made deterministic. `k` derives from fitToPoints,
 * which derives from mercatorY, so it carries the same cross-engine divergence
 * as a projected coordinate -- and it reaches the DOM both in the transform
 * string and through every `size(v) = v / scale` division in the map components.
 * See svgNumber() in projection.ts for why that matters.
 *
 * Consequence: a pan smaller than 0.01 viewBox units (~0.01 CSS pixels) now
 * rounds to no movement. Pointer deltas are at least 1 px, so this is
 * imperceptible. It also makes viewsEqual() reliable, since it compares with ===.
 */
export function clampTranslate(view: MapView): MapView {
  const k = roundScale(clampScale(view.k));
  const minX = VIEWBOX_WIDTH * (1 - k);
  const minY = VIEWBOX_HEIGHT * (1 - k);

  const x = Number.isFinite(view.x) ? Math.min(0, Math.max(minX, view.x)) : 0;
  const y = Number.isFinite(view.y) ? Math.min(0, Math.max(minY, view.y)) : 0;

  return { x: svgNumber(x), y: svgNumber(y), k };
}

/**
 * The `transform` attribute for the map's content group.
 *
 * One formatter, so the transform cannot regain full float precision at a call
 * site. Values arrive pre-rounded from clampTranslate.
 */
export function transformFor(view: MapView): string {
  return `translate(${view.x} ${view.y}) scale(${view.k})`;
}

/** Convenience: clamp both scale and translation. */
export function normalizeView(view: MapView): MapView {
  return clampTranslate({ ...view, k: clampScale(view.k) });
}

export function panBy(view: MapView, dx: number, dy: number): MapView {
  return clampTranslate({ x: view.x + dx, y: view.y + dy, k: view.k });
}

/**
 * Zoom about a fixed point, given in viewBox coordinates.
 *
 * Keeps `focus` visually stationary, which is what makes wheel zoom and pinch
 * feel anchored rather than drifting toward the centre.
 */
export function zoomAt(view: MapView, factor: number, focus: Point): MapView {
  const k = clampScale(view.k * factor);
  // Guard against a no-op division when the scale is already at a limit.
  if (k === view.k) return clampTranslate(view);

  const ratio = k / view.k;
  return clampTranslate({
    x: focus.x - (focus.x - view.x) * ratio,
    y: focus.y - (focus.y - view.y) * ratio,
    k,
  });
}

/** Zoom about the centre of the viewport, for the +/- buttons. */
export function zoomByStep(view: MapView, direction: 1 | -1): MapView {
  const factor = direction === 1 ? ZOOM_STEP : 1 / ZOOM_STEP;
  return zoomAt(view, factor, { x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT / 2 });
}

export interface FitOptions {
  /** Padding in viewBox units kept between the content and the edges. */
  padding?: number;
  /**
   * Never fit tighter than this. Fitting to a single marker would otherwise
   * slam to MAX_SCALE, which is disorienting.
   */
  maxScale?: number;
}

const DEFAULT_PADDING = 90;
const DEFAULT_FIT_MAX_SCALE = 3;

/**
 * Frame a set of projected points.
 *
 * Returns the identity view for an empty set, so an unmapped catalog shows the
 * whole illustration rather than jumping somewhere meaningless.
 */
export function fitToPoints(points: readonly Point[], options: FitOptions = {}): MapView {
  const padding = options.padding ?? DEFAULT_PADDING;
  const maxScale = Math.min(MAX_SCALE, options.maxScale ?? DEFAULT_FIT_MAX_SCALE);

  if (points.length === 0) return IDENTITY_VIEW;

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (const { x, y } of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;

  // A single point, or several at the same spot, has no span to fit to.
  const availableX = Math.max(1, VIEWBOX_WIDTH - padding * 2);
  const availableY = Math.max(1, VIEWBOX_HEIGHT - padding * 2);
  const scaleX = spanX > 0 ? availableX / spanX : maxScale;
  const scaleY = spanY > 0 ? availableY / spanY : maxScale;

  const k = Math.min(maxScale, Math.max(MIN_SCALE, Math.min(scaleX, scaleY)));

  // Centre the bounding box.
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;

  return clampTranslate({
    x: VIEWBOX_WIDTH / 2 - centreX * k,
    y: VIEWBOX_HEIGHT / 2 - centreY * k,
    k,
  });
}

/** Whether a projected map point is inside the currently visible map area. */
export function pointIsVisible(point: Point, view: MapView): boolean {
  const x = point.x * view.k + view.x;
  const y = point.y * view.k + view.y;
  return x >= 0 && x <= VIEWBOX_WIDTH && y >= 0 && y <= VIEWBOX_HEIGHT;
}

function safeBounds(insets: ViewInsets) {
  const left = Math.max(0, Math.min(VIEWBOX_WIDTH / 2 - 1, insets.left));
  const right = Math.min(
    VIEWBOX_WIDTH,
    Math.max(VIEWBOX_WIDTH / 2 + 1, VIEWBOX_WIDTH - insets.right),
  );
  const top = Math.max(0, Math.min(VIEWBOX_HEIGHT / 2 - 1, insets.top));
  const bottom = Math.min(
    VIEWBOX_HEIGHT,
    Math.max(VIEWBOX_HEIGHT / 2 + 1, VIEWBOX_HEIGHT - insets.bottom),
  );
  return { left, right, top, bottom };
}

/** Whether a projected point clears controls, previews and mobile chrome. */
export function pointIsWithinPaddedView(
  point: Point,
  view: MapView,
  insets: ViewInsets,
): boolean {
  const screenX = point.x * view.k + view.x;
  const screenY = point.y * view.k + view.y;
  const bounds = safeBounds(insets);
  // View transforms are quantized for deterministic SVG output. Treat the
  // resulting hundredth-of-a-unit boundary drift as inside the safe area.
  const epsilon = 0.02;
  return screenX >= bounds.left - epsilon && screenX <= bounds.right + epsilon &&
    screenY >= bounds.top - epsilon && screenY <= bounds.bottom + epsilon;
}

export interface SelectionViewOptions {
  insets: ViewInsets;
  /** Screen-space distance beyond which preserving context requires a zoom-out. */
  distantThreshold?: number;
}

/**
 * Bring one selected point into the usable viewport with the least disruption.
 *
 * Safe points are a true no-op. Edge and nearby off-screen points preserve the
 * current scale and pan only as far as needed. A genuinely distant point is fit
 * together with the current geographic centre, which explains the move without
 * discarding the user's context or ever zooming in.
 */
export function viewForSelectedPoint(
  point: Point,
  current: MapView,
  { insets, distantThreshold = Math.hypot(VIEWBOX_WIDTH, VIEWBOX_HEIGHT) * 0.55 }:
    SelectionViewOptions,
): MapView {
  if (pointIsWithinPaddedView(point, current, insets)) return current;

  const bounds = safeBounds(insets);
  const screenX = point.x * current.k + current.x;
  const screenY = point.y * current.k + current.y;
  const desiredX = Math.min(bounds.right, Math.max(bounds.left, screenX));
  const desiredY = Math.min(bounds.bottom, Math.max(bounds.top, screenY));
  const outsideDistance = Math.hypot(desiredX - screenX, desiredY - screenY);

  if (outsideDistance <= distantThreshold) {
    return panBy(current, desiredX - screenX, desiredY - screenY);
  }

  const currentCentre = viewBoxToContent(
    { x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT / 2 },
    current,
  );
  const symmetricPadding = Math.max(
    DEFAULT_PADDING,
    insets.top,
    insets.right,
    insets.bottom,
    insets.left,
  );
  const fitted = fitToPoints([currentCentre, point], {
    padding: symmetricPadding,
    maxScale: current.k,
  });
  // Near the geographic edge, the translation clamp can consume fit padding.
  // Keep just enough scale for that edge point to physically clear the inset;
  // this is still a zoom-out from the current view, never a surprise zoom-in.
  const edgeScale = Math.max(
    point.x > 0 ? bounds.left / point.x : MIN_SCALE,
    point.x < VIEWBOX_WIDTH
      ? (VIEWBOX_WIDTH - bounds.right) / (VIEWBOX_WIDTH - point.x)
      : MIN_SCALE,
    point.y > 0 ? bounds.top / point.y : MIN_SCALE,
    point.y < VIEWBOX_HEIGHT
      ? (VIEWBOX_HEIGHT - bounds.bottom) / (VIEWBOX_HEIGHT - point.y)
      : MIN_SCALE,
  );
  const contextual = edgeScale > fitted.k && edgeScale <= current.k
    ? clampTranslate({
        x: VIEWBOX_WIDTH / 2 - ((currentCentre.x + point.x) / 2) * edgeScale,
        y: VIEWBOX_HEIGHT / 2 - ((currentCentre.y + point.y) / 2) * edgeScale,
        k: edgeScale,
      })
    : fitted;
  const fittedX = point.x * contextual.k + contextual.x;
  const fittedY = point.y * contextual.k + contextual.y;
  const finalX = Math.min(bounds.right, Math.max(bounds.left, fittedX));
  const finalY = Math.min(bounds.bottom, Math.max(bounds.top, fittedY));
  return panBy(contextual, finalX - fittedX, finalY - fittedY);
}

/**
 * Frame points only when the current viewport excludes at least one of them.
 *
 * The current scale is the fit ceiling, so this may zoom out or preserve zoom
 * while recentering, but can never zoom in. Returning the original object for
 * the all-visible case also guarantees a true no-op for reveal events that do
 * not need a viewport adjustment.
 */
export function fitPointsIfOutsideView(
  points: readonly Point[],
  current: MapView,
  options: FitOptions = {},
): MapView {
  if (points.length === 0 || points.every((point) => pointIsVisible(point, current))) {
    return current;
  }
  return fitToPoints(points, {
    ...options,
    maxScale: Math.min(current.k, options.maxScale ?? current.k),
  });
}

/** Frame a set of coordinates. Convenience wrapper over fitToPoints. */
export function fitToCoordinates(
  coordinates: readonly LatLng[],
  options: FitOptions = {},
): MapView {
  return fitToPoints(coordinates.map(project), options);
}

/**
 * Convert a point in client (pixel) space to viewBox space.
 *
 * `rect` is the SVG's bounding box. This accounts for `preserveAspectRatio`
 * "meet" letterboxing, so a wheel or pinch gesture anchors correctly whatever
 * shape the container happens to be.
 */
export function clientToViewBox(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };

  // "meet" scales uniformly by the smaller ratio and centres the remainder.
  const scale = Math.min(rect.width / VIEWBOX_WIDTH, rect.height / VIEWBOX_HEIGHT);
  const renderedWidth = VIEWBOX_WIDTH * scale;
  const renderedHeight = VIEWBOX_HEIGHT * scale;
  const offsetX = (rect.width - renderedWidth) / 2;
  const offsetY = (rect.height - renderedHeight) / 2;

  return {
    x: (clientX - rect.left - offsetX) / scale,
    y: (clientY - rect.top - offsetY) / scale,
  };
}

/** Undo the current transform, giving the content coordinate under a point. */
export function viewBoxToContent(point: Point, view: MapView): Point {
  return { x: (point.x - view.x) / view.k, y: (point.y - view.y) / view.k };
}

export function viewsEqual(a: MapView, b: MapView): boolean {
  return a.x === b.x && a.y === b.y && a.k === b.k;
}

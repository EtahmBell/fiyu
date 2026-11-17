import { VIEWBOX_HEIGHT, VIEWBOX_WIDTH, type Point, roundNumber } from "./projection";
export interface MapView { x: number; y: number; k: number }
export const MIN_SCALE = 1; export const MAX_SCALE = 4; export const ZOOM_STEP = 1.5; export const IDENTITY_VIEW: MapView = { x: 0, y: 0, k: 1 };
export function normalizeView(view: MapView): MapView { const k = Number.isFinite(view.k) ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.k)) : MIN_SCALE; return { x: roundNumber(Math.min(0, Math.max(VIEWBOX_WIDTH * (1 - k), Number.isFinite(view.x) ? view.x : 0))), y: roundNumber(Math.min(0, Math.max(VIEWBOX_HEIGHT * (1 - k), Number.isFinite(view.y) ? view.y : 0))), k: Math.round(k * 1_000_000) / 1_000_000 }; }
export function viewBoxFor(view: MapView) { const v = normalizeView(view); return `${roundNumber(-v.x / v.k)} ${roundNumber(-v.y / v.k)} ${roundNumber(VIEWBOX_WIDTH / v.k)} ${roundNumber(VIEWBOX_HEIGHT / v.k)}`; }
export function panBy(view: MapView, dx: number, dy: number) { return normalizeView({ ...view, x: view.x + dx, y: view.y + dy }); }
export function zoomAt(view: MapView, factor: number, focus: Point) { const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.k * factor)); if (k === view.k) return normalizeView(view); const ratio = k / view.k; return normalizeView({ x: focus.x - (focus.x - view.x) * ratio, y: focus.y - (focus.y - view.y) * ratio, k }); }
export function pinchView(start: MapView, startMidpoint: Point, startDistance: number, currentMidpoint: Point, currentDistance: number) { if (startDistance <= 0 || currentDistance <= 0) return normalizeView(start); const content = { x: (startMidpoint.x - start.x) / start.k, y: (startMidpoint.y - start.y) / start.k }; const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, start.k * currentDistance / startDistance)); return normalizeView({ x: currentMidpoint.x - content.x * k, y: currentMidpoint.y - content.y * k, k }); }

export function zoomByStep(view: MapView, direction: 1 | -1) {
  return zoomAt(view, direction === 1 ? ZOOM_STEP : 1 / ZOOM_STEP, { x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT / 2 });
}

export function fitToPoints(points: readonly Point[], options: { padding?: number; maxScale?: number } = {}): MapView {
  if (points.length === 0) return IDENTITY_VIEW;
  const padding = options.padding ?? 90;
  const maxScale = Math.min(MAX_SCALE, options.maxScale ?? 3);
  let minX = points[0].x; let maxX = points[0].x; let minY = points[0].y; let maxY = points[0].y;
  for (const point of points) { minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y); }
  const availableX = Math.max(1, VIEWBOX_WIDTH - padding * 2);
  const availableY = Math.max(1, VIEWBOX_HEIGHT - padding * 2);
  const spanX = maxX - minX; const spanY = maxY - minY;
  const k = Math.min(maxScale, Math.max(MIN_SCALE, Math.min(spanX > 0 ? availableX / spanX : maxScale, spanY > 0 ? availableY / spanY : maxScale)));
  return normalizeView({ x: VIEWBOX_WIDTH / 2 - ((minX + maxX) / 2) * k, y: VIEWBOX_HEIGHT / 2 - ((minY + maxY) / 2) * k, k });
}

export function centerPointsAtScale(points: readonly Point[], scale: number): MapView {
  if (points.length === 0) return IDENTITY_VIEW;
  let minX = points[0].x; let maxX = points[0].x; let minY = points[0].y; let maxY = points[0].y;
  for (const point of points) { minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y); }
  return normalizeView({ x: VIEWBOX_WIDTH / 2 - ((minX + maxX) / 2) * scale, y: VIEWBOX_HEIGHT / 2 - ((minY + maxY) / 2) * scale, k: scale });
}

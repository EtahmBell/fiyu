/**
 * Geographic projection for the Fiyu discovery map.
 *
 * ---------------------------------------------------------------------------
 * GEOGRAPHIC BOUNDS
 *
 *   west   139.56 E      east   139.92 E
 *   south   35.52 N      north   35.82 N
 *
 * This box covers Tokyo's 23 special wards, which is the whole of Fiyu's
 * editorial area. Anything outside it is off the map by definition.
 *
 * PROJECTION
 *
 * Spherical Web Mercator (EPSG:3857), the same projection every slippy map
 * uses. Longitude is linear; latitude passes through the Mercator function
 *
 *   y(phi) = ln(tan(pi/4 + phi/2))
 *
 * so that local angles are preserved and the illustration does not look
 * vertically squashed. Across a 0.3-degree span the difference from a plain
 * linear scale is small but visible, and getting it wrong would shift markers
 * relative to the coastline.
 *
 * SVG viewBox
 *
 *   0 0 1000 1026
 *
 * The height is not arbitrary: it is the width multiplied by the Mercator
 * aspect ratio of the bounds (1.025784), rounded. Choosing any other height
 * would stretch the geography.
 *
 * LAT/LNG -> SVG
 *
 *   x = (lng - west) / (east - west) * 1000
 *   y = (mercator(north) - mercator(lat)) / mercatorSpan * 1026
 *
 * y is inverted because SVG's origin is top-left while latitude increases
 * northwards.
 *
 * LIMITATIONS OF THE ILLUSTRATED MAP
 *
 *  - The base geography is a coarse hand-authored approximation drawn from
 *    real coordinates. It is an orientation aid, not survey data, and must not
 *    be used to judge whether a restaurant is on a particular street.
 *  - No road network, building footprints or transit routing.
 *  - Marker positions are only as accurate as the coordinates the backend
 *    verified; `location_precision` records whether a point is exact,
 *    approximate or an area anchor.
 *  - The projection is spherical, not ellipsoidal. Over this area the error is
 *    on the order of metres, far below the size of a marker.
 *
 * FLOAT DETERMINISM (read before adding a numeric SVG attribute)
 *
 * `project()` is NOT safe to interpolate straight into rendered markup. See
 * svgNumber() below: every number that reaches an SVG attribute must be rounded
 * first, or server and client render different strings and React reports a
 * hydration mismatch. project() and unproject() themselves stay bit-exact.
 * ---------------------------------------------------------------------------
 */

export interface GeoBounds {
  west: number;
  east: number;
  south: number;
  north: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Tokyo's 23 special wards. */
export const TOKYO_BOUNDS: GeoBounds = {
  west: 139.56,
  east: 139.92,
  south: 35.52,
  north: 35.82,
};

export const VIEWBOX_WIDTH = 1000;
/** width * Mercator aspect of TOKYO_BOUNDS. Do not change independently. */
export const VIEWBOX_HEIGHT = 1026;

export const VIEWBOX = `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}` as const;

/** Mercator y for a latitude, in radians-equivalent units. */
export function mercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

const NORTH_Y = mercatorY(TOKYO_BOUNDS.north);
const SOUTH_Y = mercatorY(TOKYO_BOUNDS.south);
const MERCATOR_SPAN = NORTH_Y - SOUTH_Y;
const LNG_SPAN = TOKYO_BOUNDS.east - TOKYO_BOUNDS.west;

/**
 * Project a coordinate into viewBox space.
 *
 * Points outside the bounds are NOT clamped: they project to coordinates
 * outside the viewBox, which keeps the maths total and lets callers decide
 * whether to drop them. Use isWithinBounds to filter first.
 */
export function project({ lat, lng }: LatLng): Point {
  return {
    x: ((lng - TOKYO_BOUNDS.west) / LNG_SPAN) * VIEWBOX_WIDTH,
    y: ((NORTH_Y - mercatorY(lat)) / MERCATOR_SPAN) * VIEWBOX_HEIGHT,
  };
}

/**
 * Decimal places kept on any number written into an SVG attribute.
 *
 * 0.01 viewBox units is about 0.33 m of longitude and 0.29 m of latitude at
 * Tokyo's scale, and roughly 0.01 CSS pixels on a 1000px-wide map -- visually
 * lossless, and far finer than the 22-unit marker hit area.
 */
export const SVG_DECIMALS = 2;

const SVG_QUANTUM = 10 ** SVG_DECIMALS;

/**
 * Round a number for rendering, deterministically across JS engines.
 *
 * WHY THIS EXISTS -- do not remove as cosmetic tidying.
 *
 * ECMAScript (§21.3.2) leaves `Math.log` and `Math.tan` implementation-defined,
 * so Node and the browser may differ by ~1 ULP for the same input. mercatorY()
 * uses both, and project() then amplifies that difference roughly 209x through
 * catastrophic cancellation in `NORTH_Y - mercatorY(lat)`:
 *
 *   NORTH_Y             = 0.6703966741762857
 *   mercatorY(35.6706)  = 0.6671839424980388
 *   difference          = 0.0032127316782468718   <- ~209x amplification
 *
 * Observed on the "Chuo" ward label (basemap.ts, lat 35.6706), rendered raw into
 * a <text y> attribute:
 *
 *   server (Node)     y = 511.42999798943185
 *   client (browser)  y = 511.4299979894495
 *
 * React compares attributes as strings, so those are a hydration mismatch.
 * Rounding to 2dp collapses a ~1.8e-13 divergence with eleven orders of margin.
 *
 * Returns a number, not a fixed-point string: `Math.round`, `*` and `/` are all
 * exactly specified by IEEE-754, as is Number::toString -- unlike Math.log and
 * Math.tan. Keeping it numeric also leaves the value usable in arithmetic.
 */
export function svgNumber(value: number): number {
  return Math.round(value * SVG_QUANTUM) / SVG_QUANTUM;
}

/** svgNumber applied to both axes. Use at every render boundary. */
export function roundPoint({ x, y }: Point): Point {
  return { x: svgNumber(x), y: svgNumber(y) };
}

/**
 * Approximate viewBox units for a distance in metres, at a given latitude.
 *
 * Used for the GPS accuracy ring. Derived from the projection's own constants so
 * it cannot drift out of step with VIEWBOX_HEIGHT or TOKYO_BOUNDS, and scaled by
 * the local Mercator derivative rather than treating latitude as linear.
 */
export function metersToViewBoxUnits(meters: number, atLat: number): number {
  const METRES_PER_DEGREE_LAT = 110_574;
  const degrees = meters / METRES_PER_DEGREE_LAT;
  // Local vertical scale: viewBox units per degree of latitude, here.
  const unitsPerDegree =
    ((mercatorY(atLat + degrees / 2) - mercatorY(atLat - degrees / 2)) / MERCATOR_SPAN) *
    VIEWBOX_HEIGHT;
  return degrees === 0 ? 0 : Math.abs(unitsPerDegree);
}

/** Inverse of project(). Used for click-to-place-a-pin. */
export function unproject({ x, y }: Point): LatLng {
  const lng = TOKYO_BOUNDS.west + (x / VIEWBOX_WIDTH) * LNG_SPAN;
  const mercY = NORTH_Y - (y / VIEWBOX_HEIGHT) * MERCATOR_SPAN;
  const lat = (360 / Math.PI) * (Math.atan(Math.exp(mercY)) - Math.PI / 4);
  return { lat, lng };
}

export function isWithinBounds({ lat, lng }: LatLng): boolean {
  return (
    lat >= TOKYO_BOUNDS.south &&
    lat <= TOKYO_BOUNDS.north &&
    lng >= TOKYO_BOUNDS.west &&
    lng <= TOKYO_BOUNDS.east
  );
}

/** Project a run of coordinates into an SVG path `d` string. */
export function toPath(coordinates: readonly LatLng[], close = false): string {
  if (coordinates.length === 0) return "";
  const commands = coordinates.map((coordinate, index) => {
    const { x, y } = roundPoint(project(coordinate));
    return `${index === 0 ? "M" : "L"}${x.toFixed(SVG_DECIMALS)} ${y.toFixed(SVG_DECIMALS)}`;
  });
  return commands.join(" ") + (close ? " Z" : "");
}

import type { LatLng } from "@/lib/map/projection";

/**
 * Straight-line distance between coordinates.
 *
 * WHAT THIS IS NOT. This is great-circle ("as the crow flies") distance. It is
 * not walking distance, not a route, and not a travel time. Tokyo is dense and
 * heavily gridded by rail lines and rivers, so real walking distance is
 * routinely 1.3-1.8x this figure. Every string produced here is hedged
 * accordingly, and no function in this module estimates duration.
 *
 * Fiyu is a discovery product: distance exists to give a rough sense of "near
 * me" when browsing. Turn-by-turn navigation is the job of the user's map app.
 */

/** Mean Earth radius (IUGG), in metres. */
const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Haversine great-circle distance in metres.
 *
 * Haversine assumes a sphere. Across Tokyo the error against an ellipsoidal
 * model is well under 0.5%, far below the precision these strings claim.
 */
export function haversineMeters(from: LatLng, to: LatLng): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Below this, metres are rounded to 10 m; above it, kilometres to 0.1 km. */
const KILOMETRE_THRESHOLD = 1000;

/** When either endpoint is coarse, metres are bucketed to 100 m instead of 10. */
const COARSE_METRE_BUCKET = 100;

export interface DistanceFormatOptions {
  /**
   * How the distance is described, e.g. "from your location". Supplied by the
   * anchor so the phrasing always names what it is measured from.
   */
  suffix: string;
  /**
   * True when EITHER endpoint is approximate -- an area-anchor or low-accuracy
   * origin, or a restaurant the backend located to a chome rather than a door.
   * Forces the "About" hedge even for short distances.
   *
   * Named for the measurement, not the origin: it was `approximateOrigin` while
   * only the origin could be coarse, and that name would now be a lie.
   */
  approximate: boolean;
  /**
   * True when an endpoint is coarse enough that 10 m buckets overclaim. Widens
   * sub-kilometre rounding to 100 m.
   */
  coarse?: boolean;
}

/**
 * Human distance string.
 *
 * Precision is deliberately coarse: 10 m below a kilometre, 0.1 km above it.
 * Reporting "847 m" from a GPS fix with 30 m accuracy, or from an area centre,
 * would imply precision that does not exist.
 *
 * `coarse` widens that further, to 100 m. The same argument applies with more
 * force to a chome anchor, which is nominal to roughly 100-400 m: "About 340 m"
 * would overclaim by an order of magnitude on exactly the quantity the hedge is
 * meant to disclose.
 */
export function formatDistance(
  meters: number | null,
  { suffix, approximate, coarse = false }: DistanceFormatOptions,
): string {
  if (meters === null || !Number.isFinite(meters) || meters < 0) {
    return "Distance unavailable";
  }

  if (meters < KILOMETRE_THRESHOLD) {
    const bucket = coarse ? COARSE_METRE_BUCKET : 10;
    const rounded = Math.max(bucket, Math.round(meters / bucket) * bucket);
    // Two precise endpoints under a kilometre is the one case needing no hedge.
    return approximate ? `About ${rounded} m ${suffix}` : `${rounded} m ${suffix}`;
  }

  const km = Math.round(meters / 100) / 10;
  return `About ${km.toFixed(1)} km ${suffix}`;
}

/**
 * Screen-reader text making the nature of the measurement explicit, since the
 * visible string is necessarily short.
 */
export function distanceAccessibleLabel(visible: string, coarse = false): string {
  if (visible === "Distance unavailable") return visible;
  const base = `${visible}, straight-line distance`;
  return coarse ? `${base}, from an approximate location` : base;
}

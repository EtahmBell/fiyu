import type { PublicRestaurant } from "@/lib/api/schemas";

/**
 * Which restaurants may appear on the map.
 *
 * Fiyu plots a restaurant only when its coordinates have been independently
 * sourced and verified by an operator. The frontend never invents, repairs or
 * infers a position.
 *
 * The backend already enforces this -- public_catalog.py nulls latitude,
 * longitude and location_precision whenever map_display_eligible is false -- so
 * these checks are belt-and-braces. They are written explicitly anyway so the
 * rule is visible at the point of use rather than implied by a remote SQL
 * detail, and so a backend regression cannot silently start plotting pins.
 */

/** A restaurant that is safe to plot. */
export type MappableRestaurant = PublicRestaurant & {
  latitude: number;
  longitude: number;
};

/** Coordinate provenance the backend is willing to stand behind. */
const KNOWN_PRECISIONS = new Set(["exact", "approximate", "area_anchor"]);

function isValidLatitude(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= -180 && value <= 180;
}

/**
 * True only when every condition holds: the backend marked it eligible, both
 * coordinates are present and in range, and provenance is a value we recognise.
 * Unknown provenance is treated as not plottable.
 */
export function isMappable(restaurant: PublicRestaurant): restaurant is MappableRestaurant {
  return (
    restaurant.map_display_eligible &&
    isValidLatitude(restaurant.latitude) &&
    isValidLongitude(restaurant.longitude) &&
    restaurant.location_precision !== null &&
    KNOWN_PRECISIONS.has(restaurant.location_precision)
  );
}

export function mappableRestaurants(
  restaurants: readonly PublicRestaurant[],
): MappableRestaurant[] {
  return restaurants.filter(isMappable);
}

/** How many of a result set cannot be plotted, for honest disclosure. */
export function unmappableCount(restaurants: readonly PublicRestaurant[]): number {
  return restaurants.length - mappableRestaurants(restaurants).length;
}

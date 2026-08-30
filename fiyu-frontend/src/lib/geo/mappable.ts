import type { PublicRestaurant } from "@/lib/api/schemas";
import { isWithinBounds } from "@/lib/map/projection";

/**
 * Which restaurants may appear on the map.
 *
 * Fiyu plots a restaurant only when its coordinates have been independently
 * sourced and verified by an operator. The frontend never invents, repairs or
 * infers a position.
 *
 * `map_display_eligible` IS THAT RULE. It is a contract, not a hint: the
 * backend nulls latitude and longitude whenever it is false
 * (public_catalog.py:903-911), and the schema defaults it to false, so an
 * unverified restaurant cannot carry a plottable position. The coordinate
 * checks below are genuine second-layer defence -- they hold if validation is
 * bypassed or a backend regression emits a position without eligibility.
 *
 * WHAT IS DELIBERATELY NOT CHECKED: location_precision.
 *
 * This function used to also require that value to be one of
 * {exact, approximate, area_anchor}. That allow-list was never derived from the
 * backend, which serves COALESCE(map_location_precision, location_precision)
 * over a vocabulary of at least nine values maintained across three modules
 * (address_geocoding.py:22-40, address_research.py:198-201). When the OSM
 * pipeline began emitting "chome" and "parcel_or_street_number", the list
 * silently dropped 3 of 5 verified pins -- no error, no rejected row, the loss
 * reported as an ordinary unmappableCount. Fail-closed, and invisible.
 *
 * Do not reinstate it, and do not invert it into a deny-list either: that would
 * fail OPEN on an unrecognised value, which is worse against the rule above.
 * The question the allow-list was reaching for -- "is this coordinate coarse?"
 * -- is answered explicitly by the backend as map_location_approximate and
 * location_label. See lib/geo/precision.ts.
 */

/** A restaurant that is safe to plot. */
export type MappableRestaurant = PublicRestaurant & {
  latitude: number;
  longitude: number;
  /** Present on authenticated Map rows; absent on ordinary public catalog rows. */
  is_visited?: boolean;
  /** Latest explicit owner-selected rating; absent/null for legacy reaction-only visits. */
  user_rating?: number | null;
};

function isValidLatitude(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= -180 && value <= 180;
}

/**
 * True when the backend marked the restaurant eligible and both coordinates are
 * present, finite and in range. `location_precision` is informational and is
 * deliberately not consulted -- see the note above.
 */
export function isMappable(restaurant: PublicRestaurant): restaurant is MappableRestaurant {
  return (
    restaurant.map_display_eligible &&
    isValidLatitude(restaurant.latitude) &&
    isValidLongitude(restaurant.longitude)
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

/**
 * How many mappable restaurants fall outside the illustrated map area.
 *
 * Counted rather than filtered out by isMappable: these have verified
 * coordinates and belong in the list. Only the illustration cannot show them, so
 * this is a presentation limit to disclose, not grounds for hiding the data.
 */
export function outsideMapBounds(restaurants: readonly PublicRestaurant[]): number {
  return mappableRestaurants(restaurants).filter(
    (restaurant) => !isWithinBounds({ lat: restaurant.latitude, lng: restaurant.longitude }),
  ).length;
}

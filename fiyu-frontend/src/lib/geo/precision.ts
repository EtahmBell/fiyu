import type { PublicRestaurant } from "@/lib/api/schemas";

/**
 * How coarse a restaurant's coordinate is, and how to say so.
 *
 * Separate from lib/geo/mappable.ts on purpose: that module answers exactly one
 * question -- may this be plotted at all -- and its value is in staying that
 * small. This module answers a different one, for three unrelated consumers
 * (map markers, restaurant cards, outbound map links).
 *
 * Fiyu publishes chome-level anchors for restaurants whose exact door has not
 * been verified. That is honest only if the coarseness is visible. A chome
 * anchor is nominal to roughly 100-400 metres, so a pin drawn as a precise point
 * or a distance rendered as "340 m" would both overclaim.
 *
 * The wording always comes from the backend (`location_label`, currently
 * "Approximate area"). Fiyu never paraphrases it -- the same rule already
 * applied to LocationAnchor.qualifier.
 */

/**
 * True when a coordinate should be presented as an area rather than a point.
 *
 * Deliberately an OR of three independent backend signals rather than a single
 * flag. The removed precision allow-list in mappable.ts failed CLOSED and
 * silently hid verified pins; this predicate is built to fail the other way, so
 * a partial backend response errs toward more disclosure, never less. Any one
 * signal is enough to hedge.
 */
export function isApproximateLocation(restaurant: PublicRestaurant): boolean {
  return (
    restaurant.map_location_approximate ||
    restaurant.location_label !== null ||
    restaurant.map_anchor_type !== null
  );
}

/**
 * The backend's own disclosure wording, or null when the coordinate is precise.
 *
 * Falls back to a literal only when the backend flagged approximation without
 * supplying a label, so an approximate pin is never left silent.
 */
export function locationLabel(restaurant: PublicRestaurant): string | null {
  if (restaurant.location_label !== null) return restaurant.location_label;
  return isApproximateLocation(restaurant) ? "Approximate area" : null;
}

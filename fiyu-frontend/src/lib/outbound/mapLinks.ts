import type { MappableRestaurant } from "@/lib/geo/mappable";
import { resolveNames } from "@/lib/format/language";

/**
 * Links out to the user's own map app.
 *
 * Fiyu does not do navigation, directions or live hours. When someone actually
 * wants to go somewhere, that belongs in the app they already use.
 *
 * These are plain URLs. Nothing here calls an embedded map, a directions API or
 * any Google service, and no key is involved.
 *
 * Only a MappableRestaurant can be passed in, so a link can never be built from
 * coordinates the backend has not verified. Callers must not render these
 * actions for a restaurant that is not mappable.
 */

function labelFor(restaurant: MappableRestaurant): string {
  return resolveNames(restaurant).primary?.text ?? "Restaurant";
}

/**
 * Google Maps universal URL.
 *
 * Coordinates are the query and place_id is passed alongside, so Google
 * resolves the exact place rather than searching by a name that may be
 * ambiguous or Japanese-only.
 */
export function googleMapsUrl(restaurant: MappableRestaurant): string {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", `${restaurant.latitude},${restaurant.longitude}`);
  url.searchParams.set("query_place_id", restaurant.place_id);
  return url.toString();
}

/**
 * Apple Maps universal URL.
 *
 * `ll` places the map, `q` supplies the label. Apple has no equivalent of
 * Google's place id, so the name is the best available identifier -- it is a
 * display label only, and the coordinates do the positioning.
 */
export function appleMapsUrl(restaurant: MappableRestaurant): string {
  const url = new URL("https://maps.apple.com/");
  url.searchParams.set("ll", `${restaurant.latitude},${restaurant.longitude}`);
  url.searchParams.set("q", labelFor(restaurant));
  return url.toString();
}

export interface OutboundMapLink {
  id: "google" | "apple";
  label: string;
  href: string;
}

export function outboundMapLinks(restaurant: MappableRestaurant): OutboundMapLink[] {
  return [
    { id: "google", label: "Open in Google Maps", href: googleMapsUrl(restaurant) },
    { id: "apple", label: "Open in Apple Maps", href: appleMapsUrl(restaurant) },
  ];
}

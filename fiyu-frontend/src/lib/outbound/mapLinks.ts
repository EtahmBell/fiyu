import type { PublicRestaurant } from "@/lib/api/schemas";
import { resolveNames } from "@/lib/format/language";
import { isMappable } from "@/lib/geo/mappable";

/**
 * Links out to the user's own map app.
 *
 * Fiyu does not do navigation, directions or live hours. When someone actually
 * wants to go somewhere, that belongs in the app they already use.
 *
 * These are plain URLs. Nothing here calls an embedded map, a directions API or
 * any Google service, and no key is involved.
 *
 * WHAT GUARANTEES CORRECTNESS
 *
 * This used to accept only a MappableRestaurant, so the type system alone proved
 * a link could not be built from unverified coordinates. That no longer works: an
 * approximately-located restaurant needs a link built from its written address,
 * and so must not be required to prove it has plottable coordinates first.
 *
 * The guarantee is now structural instead, and there are exactly two branches:
 *
 *  - Coordinates, only behind `isMappable(r) && r.directions_coordinates_eligible`.
 *  - The verified written address, which reads no coordinate field at all.
 *
 * There is deliberately NO coordinate fallback. A chome anchor is nominal to
 * roughly 100-400 metres; handing it to a maps app as a destination would drop
 * someone at a block centroid while presenting it as the restaurant. If neither
 * branch applies, the link is null and the caller renders nothing.
 */

function labelFor(restaurant: PublicRestaurant): string {
  return resolveNames(restaurant).primary?.text ?? "Restaurant";
}

/** True when the backend cleared this restaurant's coordinates for navigation. */
function canUseCoordinates(
  restaurant: PublicRestaurant,
): restaurant is PublicRestaurant & { latitude: number; longitude: number } {
  return isMappable(restaurant) && restaurant.directions_coordinates_eligible;
}

/**
 * Google Maps universal URL.
 *
 * For a precise restaurant, coordinates are the query. For an approximate one,
 * the verified written address is. Either way `query_place_id` is passed
 * alongside -- it is an identifier, not a position, so it is safe in both cases
 * and lets Google resolve the exact place rather than searching by a name that
 * may be ambiguous or Japanese-only.
 */
export function googleMapsUrl(restaurant: PublicRestaurant): string | null {
  const query = canUseCoordinates(restaurant)
    ? `${restaurant.latitude},${restaurant.longitude}`
    : restaurant.external_map_search_query;
  if (query === null) return null;

  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", query);
  url.searchParams.set("query_place_id", restaurant.place_id);
  return url.toString();
}

/**
 * Apple Maps universal URL.
 *
 * Apple has no equivalent of Google's place id. For a precise restaurant `ll`
 * positions the map and `q` supplies the label. For an approximate one `ll` is
 * omitted entirely and the address becomes the search query -- letting Apple
 * geocode the address itself is strictly better than sending it to a centroid.
 */
export function appleMapsUrl(restaurant: PublicRestaurant): string | null {
  const url = new URL("https://maps.apple.com/");

  if (canUseCoordinates(restaurant)) {
    url.searchParams.set("ll", `${restaurant.latitude},${restaurant.longitude}`);
    url.searchParams.set("q", labelFor(restaurant));
    return url.toString();
  }

  const address = restaurant.external_map_search_query;
  if (address === null) return null;
  url.searchParams.set("q", address);
  return url.toString();
}

export interface OutboundMapLink {
  id: "google" | "apple";
  label: string;
  href: string;
}

/** May be empty, when neither verified coordinates nor an address is available. */
export function outboundMapLinks(restaurant: PublicRestaurant): OutboundMapLink[] {
  const google = googleMapsUrl(restaurant);
  const apple = appleMapsUrl(restaurant);

  return [
    ...(google === null ? [] : [{ id: "google" as const, label: "Open in Google Maps", href: google }]),
    ...(apple === null ? [] : [{ id: "apple" as const, label: "Open in Apple Maps", href: apple }]),
  ];
}

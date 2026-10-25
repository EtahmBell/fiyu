import type { PublicRestaurant } from "@fiyu/contracts";

import { restaurantName } from "@/lib/presentation";

export const FIYU_WEB_ORIGIN = "https://fiyu.app";

export function restaurantShareUrl(placeId: string): string {
  return `${FIYU_WEB_ORIGIN}/restaurants/${encodeURIComponent(placeId)}`;
}

export function restaurantDirectionsUrl(restaurant: PublicRestaurant, platform: "ios" | "android" | "web"): string | null {
  const coordinatesReady = restaurant.map_display_eligible
    && restaurant.directions_coordinates_eligible
    && restaurant.latitude !== null
    && restaurant.longitude !== null;

  if (coordinatesReady) {
    const point = `${restaurant.latitude},${restaurant.longitude}`;
    if (platform === "ios") {
      return `https://maps.apple.com/?ll=${encodeURIComponent(point)}&q=${encodeURIComponent(restaurantName(restaurant))}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point)}&query_place_id=${encodeURIComponent(restaurant.place_id)}`;
  }

  if (!restaurant.external_map_search_query) return null;
  const query = encodeURIComponent(restaurant.external_map_search_query);
  if (platform === "ios") return `https://maps.apple.com/?q=${query}`;
  return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(restaurant.place_id)}`;
}

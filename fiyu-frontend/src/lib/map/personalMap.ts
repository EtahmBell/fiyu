import type { MapRestaurant } from "@/lib/api/schemas";

export const PERSONAL_MAP_FILTERS = ["all", "saved", "visited", "discovered"] as const;

export type PersonalMapFilter = (typeof PERSONAL_MAP_FILTERS)[number];

export function belongsToPersonalMapFilter(
  restaurant: MapRestaurant,
  filter: PersonalMapFilter,
): boolean {
  if (!restaurant.map_display_eligible) return false;
  if (filter === "saved") return restaurant.is_saved;
  if (filter === "visited") return restaurant.is_visited;
  // During a rolling deploy, legacy Map rows have no discovery flag and came
  // exclusively from the old discovered-or-visited endpoint.
  const discovered = restaurant.is_discovered !== false;
  if (filter === "discovered") return discovered;
  return discovered || restaurant.is_visited;
}

export function filterPersonalMapRestaurants(
  restaurants: readonly MapRestaurant[],
  filter: PersonalMapFilter,
): MapRestaurant[] {
  return restaurants.filter((restaurant) => belongsToPersonalMapFilter(restaurant, filter));
}

/**
 * Add the active Personalized Pick without inventing account relationships.
 * The event owns the special treatment and active discovery window; the map
 * payload remains authoritative for independently saved or visited state.
 */
export function mergeActivePersonalizedPick(
  restaurants: readonly MapRestaurant[],
  personalized: MapRestaurant | null,
): MapRestaurant[] {
  if (!personalized) return [...restaurants];
  const existing = restaurants.find(
    (restaurant) => restaurant.place_id === personalized.place_id,
  );
  const active = existing
    ? {
        ...personalized,
        is_saved: existing.is_saved,
        is_visited: existing.is_visited,
        user_rating: existing.user_rating,
      }
    : personalized;
  return [
    active,
    ...restaurants
      .filter((restaurant) => restaurant.place_id !== personalized.place_id)
      .map((restaurant) => ({ ...restaurant, is_personalized_pick: false })),
  ];
}

export function reconcileDiscoveryExpiry(
  restaurants: readonly MapRestaurant[],
  now: number,
): MapRestaurant[] {
  return restaurants.map((restaurant) => {
    const expiresAt = restaurant.discovery_expires_at
      ? Date.parse(restaurant.discovery_expires_at)
      : Number.NaN;
    return restaurant.is_discovered && Number.isFinite(expiresAt) && now >= expiresAt
      ? { ...restaurant, is_discovered: false }
      : restaurant;
  });
}

export function personalMapMarkerState(
  restaurant: {
    is_discovered?: boolean;
    is_saved?: boolean;
    is_visited?: boolean;
  },
): "discovered" | "saved" | "visited" | "default" {
  if (restaurant.is_discovered !== false) return "discovered";
  if (restaurant.is_saved) return "saved";
  if (restaurant.is_visited) return "visited";
  return "default";
}

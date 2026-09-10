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
): "visited" | "discovered" | "saved" {
  if (restaurant.is_visited) return "visited";
  if (restaurant.is_discovered !== false) return "discovered";
  return "saved";
}

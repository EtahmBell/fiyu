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
  return (
    discovered ||
    restaurant.is_saved ||
    restaurant.is_visited ||
    restaurant.is_my_pick === true ||
    restaurant.is_personalized_pick === true
  );
}

export function filterPersonalMapRestaurants(
  restaurants: readonly MapRestaurant[],
  filter: PersonalMapFilter,
): MapRestaurant[] {
  return restaurants.filter((restaurant) => belongsToPersonalMapFilter(restaurant, filter));
}

/**
 * Build one deduplicated personal-place collection while preserving every
 * relationship, then add the active Personalized Pick without inventing any.
 * The map payload remains authoritative for independently saved or visited state.
 */
export function mergeActivePersonalizedPick(
  restaurants: readonly MapRestaurant[],
  personalized: MapRestaurant | null,
): MapRestaurant[] {
  const byPlaceId = new Map<string, MapRestaurant>();
  for (const restaurant of restaurants) {
    const existing = byPlaceId.get(restaurant.place_id);
    byPlaceId.set(
      restaurant.place_id,
      existing
        ? {
            ...existing,
            ...restaurant,
            is_discovered: existing.is_discovered || restaurant.is_discovered,
            is_saved: existing.is_saved || restaurant.is_saved,
            is_visited: existing.is_visited || restaurant.is_visited,
            is_personalized_pick:
              existing.is_personalized_pick || restaurant.is_personalized_pick,
            is_my_pick: existing.is_my_pick || restaurant.is_my_pick,
            user_rating: restaurant.user_rating ?? existing.user_rating,
          }
        : restaurant,
    );
  }
  const deduplicated = [...byPlaceId.values()];
  if (!personalized) return deduplicated;
  const existing = byPlaceId.get(personalized.place_id);
  const active = existing
    ? {
        ...personalized,
        is_discovered: existing.is_discovered || personalized.is_discovered,
        is_saved: existing.is_saved || personalized.is_saved,
        is_visited: existing.is_visited || personalized.is_visited,
        is_personalized_pick: true,
        is_my_pick: existing.is_my_pick || personalized.is_my_pick,
        user_rating: personalized.user_rating ?? existing.user_rating,
      }
    : personalized;
  return [
    active,
    ...deduplicated
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
    is_my_pick?: boolean;
  },
): "discovered" | "saved" | "visited" | "my_pick" | "default" {
  if (restaurant.is_discovered !== false) return "discovered";
  if (restaurant.is_visited) return "visited";
  if (restaurant.is_my_pick) return "my_pick";
  if (restaurant.is_saved) return "saved";
  return "default";
}

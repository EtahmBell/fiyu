"use client";

import { RestaurantCard } from "@/components/restaurant/RestaurantCard";
import type { PublicRestaurant } from "@/lib/api/schemas";

export interface RestaurantListProps {
  restaurants: PublicRestaurant[];
  selectedPlaceId?: string | null;
  onSelect?: (restaurant: PublicRestaurant) => void;
}

/**
 * Presentational list. Receives restaurants already ranked by the discovery
 * adapter and never reorders them itself.
 *
 * `role="list"` is set explicitly: several browsers drop list semantics from a
 * <ul> whose bullets are removed, which would cost screen-reader users the
 * item count and position.
 */
export function RestaurantList({ restaurants, selectedPlaceId, onSelect }: RestaurantListProps) {
  return (
    <ul role="list" className="space-y-3">
      {restaurants.map((restaurant) => (
        <li key={restaurant.place_id}>
          <RestaurantCard
            restaurant={restaurant}
            selected={restaurant.place_id === selectedPlaceId}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}

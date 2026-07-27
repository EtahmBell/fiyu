"use client";

import { useEffect, useRef } from "react";

import { RestaurantCard } from "@/components/restaurant/RestaurantCard";
import type { PublicRestaurant } from "@/lib/api/schemas";

export interface RestaurantListProps {
  restaurants: PublicRestaurant[];
  selectedPlaceId?: string | null;
  onSelect?: (restaurant: PublicRestaurant) => void;
  /**
   * Card to bring into view. Set only when the selection originated on the map,
   * so clicking a card never yanks the list out from under the pointer.
   */
  scrollToPlaceId?: string | null;
}

/**
 * Editorial index of restaurants: hairline-separated entries on the canvas
 * rather than a stack of bordered boxes.
 *
 * The divider is drawn on the <li> and suppressed around the hovered or
 * selected row, so a card lifting onto its white surface does not appear to be
 * sliced by a rule running underneath it.
 *
 * Receives restaurants already filtered and ranked by lib/discovery and never
 * reorders them. `role="list"` is explicit because several browsers drop list
 * semantics from a <ul> whose markers are removed, costing screen-reader users
 * the item count and position.
 */
export function RestaurantList({
  restaurants,
  selectedPlaceId,
  onSelect,
  scrollToPlaceId,
}: RestaurantListProps) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    if (!scrollToPlaceId) return;
    const node = itemRefs.current.get(scrollToPlaceId);
    if (!node) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({
      block: "nearest",
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [scrollToPlaceId]);

  return (
    <ul role="list" className="-mx-1">
      {restaurants.map((restaurant) => (
        <li
          key={restaurant.place_id}
          ref={(node) => {
            // Braces matter: React 19 treats a returned value as a cleanup
            // function, and Map.set returns the map.
            if (node) itemRefs.current.set(restaurant.place_id, node);
            else itemRefs.current.delete(restaurant.place_id);
          }}
          className="border-b border-line last:border-b-0 has-[article:hover]:border-transparent [&:has(+li>article:hover)]:border-transparent"
        >
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

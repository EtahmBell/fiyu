"use client";

import { useMemo, useState } from "react";

import { RankingControl } from "@/components/discovery/RankingControl";
import { RestaurantList } from "@/components/restaurant/RestaurantList";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { type DiscoveryMode, hasCoordinates, rankByMode } from "@/lib/discovery/ranking";

export interface DiscoveryShellProps {
  restaurants: PublicRestaurant[];
}

/**
 * Owns all client-side discovery state: ranking mode and selection.
 *
 * Data arrives already fetched and validated from the server component, so this
 * never touches the network. Ordering is delegated entirely to the ranking
 * adapter.
 *
 * `selected` is tracked here rather than inside the list because Phase 4's map
 * needs the same value; keeping it at this level means adding the map is a
 * sibling render, not a state refactor.
 */
export function DiscoveryShell({ restaurants }: DiscoveryShellProps) {
  const [mode, setMode] = useState<DiscoveryMode>("top-picks");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  const ranked = useMemo(() => rankByMode(restaurants, mode), [restaurants, mode]);

  // Restaurants without coordinates cannot be mapped in Phase 4. Counted here
  // so the omission is disclosed rather than silently dropping pins later.
  const unmappable = useMemo(
    () => restaurants.filter((restaurant) => !hasCoordinates(restaurant)).length,
    [restaurants],
  );

  return (
    <div className="space-y-5">
      <RankingControl mode={mode} onChange={setMode} />

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-hairline pt-4">
        <p className="text-sm text-ink-muted">
          <span className="font-display text-lg tabular-nums text-ink">{ranked.length}</span>{" "}
          {ranked.length === 1 ? "restaurant" : "restaurants"}
        </p>
        {unmappable > 0 && (
          <p className="text-xs text-ink-faint">
            {unmappable} without coordinates won&apos;t appear on the map
          </p>
        )}
      </div>

      {/* Announces reordering to screen readers, which otherwise get no signal
          that the list changed when the ranking mode is switched. */}
      <p aria-live="polite" className="sr-only">
        Showing {ranked.length} restaurants ranked by{" "}
        {mode === "top-picks" ? "top Fiyu picks" : "hidden gems"}.
      </p>

      <RestaurantList
        restaurants={ranked}
        selectedPlaceId={selectedPlaceId}
        onSelect={(restaurant) =>
          setSelectedPlaceId((current) =>
            current === restaurant.place_id ? null : restaurant.place_id,
          )
        }
      />
    </div>
  );
}

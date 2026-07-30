"use client";

import { CompactRestaurantCard } from "@/components/daily-picks/CompactRestaurantCard";
import {
  DailyCardFrame,
  type DailyCardRefRegistrar,
} from "@/components/daily-picks/DailyCardFrame";
import type { PublicRestaurant } from "@/lib/api/schemas";
import {
  formatExpirationLabel,
  getDiscoveryExpiration,
  type RevealedDiscovery,
} from "@/lib/daily-picks/history";

export interface RecentDiscoveriesProps {
  discoveries: RevealedDiscovery[];
  restaurants: PublicRestaurant[];
  savedRestaurantIds: string[];
  now: number;
  onOpen?: (restaurant: PublicRestaurant) => void;
  onToggleSaved(placeId: string): void;
  selectedPlaceId?: string | null;
  registerCardRef?: DailyCardRefRegistrar;
}

export function RecentDiscoveries({
  discoveries,
  restaurants,
  savedRestaurantIds,
  now,
  onOpen,
  onToggleSaved,
  selectedPlaceId = null,
  registerCardRef,
}: RecentDiscoveriesProps) {
  const byId = new Map(restaurants.map((restaurant) => [restaurant.place_id, restaurant]));
  const entries = discoveries
    .map((discovery) => ({ discovery, restaurant: byId.get(discovery.restaurantId) }))
    .filter(
      (entry): entry is { discovery: RevealedDiscovery; restaurant: PublicRestaurant } =>
        Boolean(entry.restaurant),
    );

  return (
    <section aria-labelledby="recent-discoveries-heading" className="border-t border-line pt-5">
      <h3 id="recent-discoveries-heading" className="font-display text-xl text-ink">
        Recent Discoveries
      </h3>

      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-ink-faint">
          Revealed restaurants from earlier selections will appear here for 72 hours.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {entries.map(({ discovery, restaurant }) => (
            <DailyCardFrame
              key={restaurant.place_id}
              placeId={restaurant.place_id}
              selected={selectedPlaceId === restaurant.place_id}
              registerRef={registerCardRef}
            >
              <CompactRestaurantCard
                restaurant={restaurant}
                saved={savedRestaurantIds.includes(restaurant.place_id)}
                expirationLabel={formatExpirationLabel(
                  getDiscoveryExpiration(discovery.revealedAt),
                  now,
                )}
                onOpen={onOpen}
                onToggleSaved={() => onToggleSaved(restaurant.place_id)}
              />
            </DailyCardFrame>
          ))}
        </div>
      )}
    </section>
  );
}

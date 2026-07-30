"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";

import { FiyuMap } from "@/components/map/FiyuMap";
import { MapUnavailable } from "@/components/map/MapUnavailable";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { recentDiscoveries } from "@/lib/daily-picks/history";
import {
  browserDailyPicksStorage,
  selectionIsActive,
} from "@/lib/daily-picks/storage";
import { mappableRestaurants } from "@/lib/geo/mappable";

const subscribeClock = (listener: () => void) => {
  const timer = window.setInterval(listener, 60_000);
  return () => window.clearInterval(timer);
};
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const serverMinute = () => 0;

export function DedicatedMap({ restaurants }: { restaurants: PublicRestaurant[] }) {
  const storage = useMemo(() => browserDailyPicksStorage(), []);
  const snapshot = useSyncExternalStore(
    storage.subscribe,
    storage.getSnapshot,
    storage.getServerSnapshot,
  );
  const now = useSyncExternalStore(subscribeClock, currentMinute, serverMinute);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  const visibleRestaurants = useMemo(() => {
    if (!snapshot) return [];
    const selection =
      snapshot.selection && selectionIsActive(snapshot.selection, now)
        ? snapshot.selection
        : null;
    const recent = recentDiscoveries(
      snapshot.discoveries,
      new Set(selection?.restaurantIds ?? []),
      now,
    );
    const visibleIds = new Set([
      ...(selection?.restaurantIds ?? []),
      ...recent.map((discovery) => discovery.restaurantId),
    ]);
    return restaurants.filter((restaurant) => visibleIds.has(restaurant.place_id));
  }, [now, restaurants, snapshot]);

  const mappable = useMemo(
    () => mappableRestaurants(visibleRestaurants),
    [visibleRestaurants],
  );

  return (
    <main className="relative h-[calc(100dvh-var(--spacing-header)-var(--spacing-mobile-nav))] min-h-[22rem] overflow-hidden bg-subtle lg:h-[calc(100dvh-var(--spacing-header))]">
      <div className="absolute top-4 left-4 z-20 rounded-card border border-line bg-surface/95 px-4 py-3 shadow-lg backdrop-blur-sm">
        <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-lavender-700 uppercase">
          Tokyo edition
        </p>
        <h1 className="mt-1 font-display text-2xl leading-none text-ink">Today&apos;s map</h1>
      </div>

      {mappable.length === 0 ? (
        <div className="flex h-full items-center justify-center px-5">
          <div className="w-full max-w-lg">
            <MapUnavailable reason="no-mapped-restaurants" className="min-h-72" />
            <p className="mt-4 text-center text-sm text-ink-muted">
              Generate today&apos;s selection in <Link href="/" className="font-medium text-lavender-700 underline underline-offset-4">Picks</Link> to place it on the map.
            </p>
          </div>
        </div>
      ) : (
        <FiyuMap
          restaurants={mappable}
          selectedPlaceId={selectedPlaceId}
          onSelect={(restaurant) => setSelectedPlaceId(restaurant.place_id)}
          surfaceMode="fullscreen"
          interactive
        />
      )}
    </main>
  );
}

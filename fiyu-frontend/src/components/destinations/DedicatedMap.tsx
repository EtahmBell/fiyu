"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FiyuMap } from "@/components/map/FiyuMap";
import { PersonalMapFilterControl } from "@/components/map/PersonalMapFilterControl";
import { FiyuLoadingScreen } from "@/components/states/FiyuLoadingScreen";
import { fetchAuthenticatedMapRestaurants } from "@/lib/api/client";
import { useAccountQuery } from "@/lib/accountQueryCache";
import type { MapRestaurant } from "@/lib/api/schemas";
import { mappableRestaurants } from "@/lib/geo/mappable";
import { useIsDesktop } from "@/lib/hooks/useMediaQuery";
import { filterPersonalMapRestaurants, type PersonalMapFilter } from "@/lib/map/personalMap";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";

const EMPTY_FILTER_COPY: Record<PersonalMapFilter, string> = {
  all: "No places yet",
  saved: "No saved places yet",
  visited: "No visited places yet",
  discovered: "No recent discoveries",
};
const MAP_STATE_REFRESH_MS = 60_000;

export function DedicatedMap() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const identity = useProfileIdentity();
  const ownerKey = identity.profile?.user_id ?? null;
  const loadMap = useCallback(() => fetchAuthenticatedMapRestaurants(), []);
  const map = useAccountQuery<MapRestaurant[]>({
    resource: "map-restaurants",
    accountId: identity.status === "loading" ? undefined : ownerKey,
    loader: loadMap,
    enabled: !isDesktop && Boolean(ownerKey),
  });
  const refreshMap = map.refresh;
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [filter, setFilter] = useState<PersonalMapFilter>("all");

  useEffect(() => {
    if (isDesktop) router.replace("/picks");
  }, [isDesktop, router]);

  useEffect(() => {
    if (!ownerKey || isDesktop) return;
    const interval = window.setInterval(() => {
      void refreshMap(true).catch(() => undefined);
    }, MAP_STATE_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [isDesktop, ownerKey, refreshMap]);

  useEffect(() => {
    if (!selectedPlaceId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedPlaceId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedPlaceId]);

  const filteredRestaurants = useMemo(
    () => map.status === "ready" ? filterPersonalMapRestaurants(map.data, filter) : [],
    [filter, map],
  );
  const mappable = useMemo(
    () => ownerKey ? mappableRestaurants(filteredRestaurants) : [],
    [filteredRestaurants, ownerKey],
  );

  const changeFilter = (nextFilter: PersonalMapFilter) => {
    setFilter(nextFilter);
    if (map.status !== "ready") return;
    const nextPlaceIds = new Set(
      filterPersonalMapRestaurants(map.data, nextFilter).map((item) => item.place_id),
    );
    setSelectedPlaceId((current) => current && !nextPlaceIds.has(current) ? null : current);
  };

  if (isDesktop || identity.status === "loading") {
    return <FiyuLoadingScreen />;
  }

  return (
    <main className="relative h-[calc(100dvh-var(--spacing-header)-var(--spacing-mobile-nav))] min-h-[22rem] overflow-hidden bg-subtle lg:h-[calc(100dvh-var(--spacing-header))]">
      <PersonalMapFilterControl
        value={filter}
        onChange={changeFilter}
        showHeading
        className="absolute top-4 right-4 left-4 z-20 sm:right-auto sm:w-[22rem]"
      />

      {ownerKey && map.status === "error" ? (
        <div className="flex h-full items-center justify-center px-5 text-center">
          <p className="text-sm text-ink-muted">We couldn&apos;t load your discoveries.</p>
        </div>
      ) : ownerKey && map.status === "loading" ? (
        <div className="flex h-full items-center justify-center px-5" role="status">
          <p className="text-sm text-ink-muted">Loading your map…</p>
        </div>
      ) : (
        <>
          <FiyuMap
            restaurants={mappable}
            selectedPlaceId={selectedPlaceId}
            onSelect={(restaurant) => setSelectedPlaceId(restaurant.place_id)}
            onMapBackgroundClick={() => setSelectedPlaceId(null)}
            showSelectedRestaurantPopup
            surfaceMode="fullscreen"
            interactive
            preserveViewportOnRestaurantChange
            viewportSessionKey={`personal-map:${ownerKey ?? "anonymous"}`}
          />
          {mappable.length === 0 && (
            <div className="pointer-events-none absolute top-36 right-4 left-4 z-10 flex justify-center">
              <p className="rounded-chip border border-line/70 bg-surface/95 px-3 py-2 text-xs text-ink-muted shadow-sm backdrop-blur-sm">
                {EMPTY_FILTER_COPY[filter]}
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}

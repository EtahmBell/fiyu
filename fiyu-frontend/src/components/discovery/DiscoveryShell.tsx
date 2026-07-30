"use client";

import { useCallback, useMemo, useState } from "react";

import { DailyPicksPanel } from "@/components/daily-picks/DailyPicksPanel";
import { PageIntro, SiteFooter } from "@/components/layout/SiteHeader";
import { FiyuMap } from "@/components/map/FiyuMap";
import { MapUnavailable } from "@/components/map/MapUnavailable";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { mappableRestaurants } from "@/lib/geo/mappable";
import { useGeolocation } from "@/lib/hooks/useGeolocation";
import type { LocationAnchor } from "@/lib/api/schemas";
import {
  originAreaName,
  originFromGeolocation,
  type FreeDiscoveryOrigin,
} from "@/lib/location/origin";

export interface DiscoveryShellProps {
  /** Already filtered to browsable rows by the server component. */
  restaurants: PublicRestaurant[];
  /** Operator-curated area centres. Empty until anchors are reviewed. */
  areaAnchors: LocationAnchor[];
}

/**
 * Where a selection came from. Kept with the selection so a future detail
 * transition can preserve whether the user arrived from the feed or map.
 */
type SelectionSource = "feed" | "map";

interface Selection {
  placeId: string;
  source: SelectionSource;
  navigationKey: number;
}

/**
 * Owns the client-side daily-feed selection and map-card synchronization.
 *
 * LAYOUT. Desktop is a true two-pane discovery view: the list column scrolls
 * independently at ~42% while the map holds the remaining ~58% of a
 * viewport-height pane. Mobile begins directly with a bounded map below the
 * site header, while the feed owns the independently scrolling lower region.
 *
 * Data arrives already fetched and validated from the server component, so this
 * never touches the network, and ordering is delegated to the ranking adapter.
 */
export function DiscoveryShell({ restaurants, areaAnchors }: DiscoveryShellProps) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [visibleRestaurantIds, setVisibleRestaurantIds] = useState<string[]>([]);
  const [homeArea, setHomeArea] = useState<LocationAnchor | null>(null);
  const [continuedWithoutLocation, setContinuedWithoutLocation] = useState(false);

  const geolocation = useGeolocation();

  const origin = useMemo<FreeDiscoveryOrigin | null>(() => {
    const current = originFromGeolocation(geolocation.state);
    if (current) return current;
    if (homeArea) return { kind: "home-area", area: homeArea };
    return continuedWithoutLocation ? { kind: "unavailable" } : null;
  }, [continuedWithoutLocation, geolocation.state, homeArea]);
  const activeArea = useMemo(
    () => originAreaName(origin, areaAnchors),
    [areaAnchors, origin],
  );

  const visibleRestaurants = useMemo(() => {
    const visible = new Set(visibleRestaurantIds);
    return restaurants.filter((restaurant) => visible.has(restaurant.place_id));
  }, [restaurants, visibleRestaurantIds]);
  const mappable = useMemo(() => mappableRestaurants(visibleRestaurants), [visibleRestaurants]);

  const select = useCallback((restaurant: PublicRestaurant, source: SelectionSource) => {
    setSelection((current) => ({
      placeId: restaurant.place_id,
      source,
      navigationKey: (current?.navigationKey ?? 0) + 1,
    }));
  }, []);

  const selectFromFeed = useCallback(
    (restaurant: PublicRestaurant) => select(restaurant, "feed"),
    [select],
  );
  const selectFromMap = useCallback(
    (restaurant: PublicRestaurant) => select(restaurant, "map"),
    [select],
  );

  return (
    <div
      data-testid="discovery-layout"
      className="grid h-[calc(100dvh-var(--spacing-header))] min-h-0 grid-cols-1 grid-rows-[40dvh_minmax(0,1fr)] overflow-hidden bg-canvas lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)] lg:grid-rows-1"
    >
      <section
        className="contents lg:col-start-1 lg:row-start-1 lg:block lg:min-h-0 lg:min-w-0 lg:overflow-y-auto lg:overscroll-contain"
      >
        <div data-testid="desktop-page-intro" className="hidden px-5 sm:px-8 lg:block">
          <PageIntro />
        </div>

        {/* The feed scrolls independently below the bounded map on mobile. */}
        <div
          data-testid="restaurant-scroll-region"
          className="row-start-2 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain lg:overflow-visible"
        >
          <div className="mx-auto w-full max-w-[38rem] px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-8 lg:mx-0 lg:max-w-none lg:pb-10">
            <div className="pt-5 lg:pt-0">
              <DailyPicksPanel
                restaurants={restaurants}
                activeArea={activeArea}
                onOpenRestaurant={selectFromFeed}
                onVisibleRestaurantIdsChange={setVisibleRestaurantIds}
                selectedPlaceId={selection?.placeId ?? null}
                scrollToPlaceId={selection?.source === "map" ? selection.placeId : null}
                scrollRequestKey={selection?.navigationKey ?? 0}
                originSetup={{
                  origin,
                  geolocation: geolocation.state,
                  areaAnchors,
                  requestCurrentLocation: geolocation.request,
                  chooseHomeArea: setHomeArea,
                  continueWithoutLocation: () => setContinuedWithoutLocation(true),
                }}
              />
            </div>

            <SiteFooter />
          </div>
        </div>
      </section>

      {/* Bounded upper pane on mobile; the existing side-by-side pane on desktop. */}
      <aside
        aria-label="Restaurant map"
        data-testid="mobile-map-region"
        className="relative row-start-1 min-h-0 min-w-0 overflow-hidden border-b border-line bg-subtle after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-10 after:h-3 after:bg-gradient-to-b after:from-transparent after:to-canvas/50 lg:col-start-2 lg:row-start-1 lg:h-full lg:border-b-0 lg:border-l lg:after:hidden"
      >
        {/*
         * The map receives current daily picks (including concealed cards) and
         * active Recent Discoveries that the backend marked map-eligible. A pin
         * can therefore navigate to a concealed card without revealing it.
         *
         * With nothing mapped there is no map to interact with, so the
         * placeholder is shown instead of an empty illustration.
         */}
        {mappable.length === 0 ? (
          <MapUnavailable reason="no-mapped-restaurants" className="h-full" />
        ) : (
          <FiyuMap
            restaurants={mappable}
            selectedPlaceId={selection?.placeId ?? null}
            onSelect={selectFromMap}
            surfaceMode="bounded"
            interactive
          />
        )}
      </aside>
    </div>
  );
}

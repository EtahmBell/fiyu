"use client";

import { useCallback, useMemo, useState } from "react";

import { MapPeekSheet } from "@/components/discovery/MapPeekSheet";
import { RankingControl } from "@/components/discovery/RankingControl";
import { DailyPicksPanel } from "@/components/daily-picks/DailyPicksPanel";
import { PageIntro, SiteFooter } from "@/components/layout/SiteHeader";
import { LocationControl } from "@/components/location/LocationControl";
import { FiyuMap } from "@/components/map/FiyuMap";
import { MapUnavailable } from "@/components/map/MapUnavailable";
import { RestaurantList } from "@/components/restaurant/RestaurantList";
import { ModeUnavailable } from "@/components/states/EmptyState";
import type { PublicRestaurant } from "@/lib/api/schemas";
import {
  DEFAULT_MODE,
  type DiscoveryMode,
  getMode,
  isModeAvailable,
  rankByMode,
} from "@/lib/discovery/ranking";
import { mappableRestaurants, outsideMapBounds, unmappableCount } from "@/lib/geo/mappable";
import { useGeolocation } from "@/lib/hooks/useGeolocation";
import { useIsDesktop } from "@/lib/hooks/useMediaQuery";
import type { DiscoveryAnchor } from "@/lib/location/anchor";
import type { LatLng } from "@/lib/map/projection";
import type { LocationAnchor } from "@/lib/api/schemas";
import { cn } from "@/lib/utils/cn";

export interface DiscoveryShellProps {
  /** Already filtered to browsable rows by the server component. */
  restaurants: PublicRestaurant[];
  /** Operator-curated area centres. Empty until anchors are reviewed. */
  areaAnchors: LocationAnchor[];
}

/** Which surface the user is looking at. Only meaningful below `lg`. */
type MobileView = "list" | "map";

/**
 * Where a selection came from. The list only auto-scrolls for map-originated
 * selections; scrolling on a card click would move the card just tapped.
 */
type SelectionSource = "list" | "map";

interface Selection {
  placeId: string;
  source: SelectionSource;
}

/**
 * Owns all client-side discovery state: ranking mode, selection, and which
 * surface is showing on mobile.
 *
 * LAYOUT. Desktop is a true two-pane discovery view: the list column scrolls
 * independently at ~42% while the map holds the remaining ~58% of a
 * viewport-height pane. Mobile is a separate experience rather than a shrunk
 * split -- a full-width editorial list, a floating Map/List pill, a full-screen
 * map, and a non-modal peek sheet for the selected pin.
 *
 * The map is mounted once and repositioned with CSS. Two instances would load
 * the Google script twice and double the map loads billed per session.
 *
 * Data arrives already fetched and validated from the server component, so this
 * never touches the network, and ordering is delegated to the ranking adapter.
 */
export function DiscoveryShell({ restaurants, areaAnchors }: DiscoveryShellProps) {
  const [mode, setMode] = useState<DiscoveryMode>(DEFAULT_MODE);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [view, setView] = useState<MobileView>("list");
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const isDesktop = useIsDesktop();

  /*
   * Location anchor. Client-side only: never persisted, never sent to the
   * backend, and cleared on reload.
   */
  const [manualPin, setManualPin] = useState<LatLng | null>(null);
  const [areaAnchor, setAreaAnchor] = useState<LocationAnchor | null>(null);
  const [placingPin, setPlacingPin] = useState(false);
  const geolocation = useGeolocation();

  /*
   * Precedence is most-explicit-first: a hand-placed pin beats a chosen area,
   * which beats a GPS fix. Setting one clears the others, so exactly one
   * anchor can ever be active.
   */
  const anchor = useMemo<DiscoveryAnchor | null>(() => {
    if (manualPin) return { kind: "manual-pin", point: manualPin };
    if (areaAnchor) {
      return {
        kind: "area-anchor",
        point: { lat: areaAnchor.latitude, lng: areaAnchor.longitude },
        id: areaAnchor.id,
        displayName: areaAnchor.display_name,
        areaName: areaAnchor.area_name,
        qualifier: areaAnchor.qualifier,
      };
    }
    if (geolocation.state.status === "granted") {
      return {
        kind: "current-location",
        point: geolocation.state.point,
        accuracyMeters: geolocation.state.accuracyMeters,
      };
    }
    return null;
  }, [manualPin, areaAnchor, geolocation.state]);

  const clearAnchor = useCallback(() => {
    setManualPin(null);
    setAreaAnchor(null);
    setPlacingPin(false);
    geolocation.clear();
  }, [geolocation]);

  const placePin = useCallback((point: LatLng) => {
    setAreaAnchor(null);
    setManualPin(point);
  }, []);

  const chooseArea = useCallback((area: LocationAnchor) => {
    setManualPin(null);
    setPlacingPin(false);
    setAreaAnchor(area);
  }, []);

  const useCurrentLocation = useCallback(() => {
    setManualPin(null);
    setAreaAnchor(null);
    setPlacingPin(false);
    geolocation.request();
  }, [geolocation]);

  const available = isModeAvailable(mode);
  const ranked = useMemo(() => rankByMode(restaurants, mode), [restaurants, mode]);

  const mappable = useMemo(() => mappableRestaurants(ranked), [ranked]);
  const unmappable = useMemo(() => unmappableCount(ranked), [ranked]);
  const offMap = useMemo(() => outsideMapBounds(ranked), [ranked]);

  const selected = useMemo(
    () => ranked.find((restaurant) => restaurant.place_id === selection?.placeId) ?? null,
    [ranked, selection],
  );

  const select = useCallback((restaurant: PublicRestaurant, source: SelectionSource) => {
    setSheetExpanded(false);
    setSelection((current) =>
      current?.placeId === restaurant.place_id ? null : { placeId: restaurant.place_id, source },
    );
  }, []);

  const selectFromList = useCallback(
    (restaurant: PublicRestaurant) => select(restaurant, "list"),
    [select],
  );
  const selectFromMap = useCallback(
    (restaurant: PublicRestaurant) => select(restaurant, "map"),
    [select],
  );

  const showingMap = view === "map";

  return (
    <div className="lg:grid lg:h-[calc(100dvh-var(--spacing-header))] lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)]">
      {/* List column: the only scroll container on desktop. */}
      <div
        className={cn(
          "min-w-0 lg:overflow-y-auto lg:overscroll-contain",
          showingMap ? "hidden lg:block" : "block",
        )}
      >
        <div className="mx-auto w-full max-w-[38rem] px-5 pb-28 sm:px-8 lg:mx-0 lg:max-w-none lg:pb-10">
          <PageIntro />

          {available ? (
            <>
              <div className="pb-1">
                <LocationControl
                  anchor={anchor}
                  geolocation={geolocation.state}
                  areaAnchors={areaAnchors}
                  placingPin={placingPin}
                  onUseCurrentLocation={useCurrentLocation}
                  onChooseArea={chooseArea}
                  onTogglePlacePin={() => setPlacingPin((on) => !on)}
                  onClear={clearAnchor}
                />
              </div>

              <DailyPicksPanel
                restaurants={restaurants}
                activeArea={areaAnchor?.area_name ?? null}
              />

              <RankingControl mode={mode} onChange={setMode} count={ranked.length} />

              <p aria-live="polite" className="sr-only">
                Showing {ranked.length} restaurants ranked by {getMode(mode).label}.
              </p>

              <RestaurantList
                restaurants={ranked}
                selectedPlaceId={selection?.placeId ?? null}
                onSelect={selectFromList}
                scrollToPlaceId={selection?.source === "map" ? selection.placeId : null}
                anchor={anchor}
              />

              {unmappable > 0 && (
                <p className="px-1 pt-4 text-xs text-ink-faint">
                  {unmappable} not shown on the map
                </p>
              )}

              {/* Verified, but beyond the illustrated area, so no pin exists. */}
              {offMap > 0 && (
                <p className="px-1 pt-1 text-xs text-ink-faint">
                  {offMap} outside the mapped area
                </p>
              )}
            </>
          ) : (
            <>
              <RankingControl mode={mode} onChange={setMode} />
              <div className="pt-2">
                <ModeUnavailable
                  label={getMode(mode).label}
                  onBrowseLocal={() => setMode(DEFAULT_MODE)}
                />
              </div>
            </>
          )}

          <SiteFooter />
        </div>
      </div>

      {/* Map pane. Full-bleed beside the list on desktop, full-screen on mobile. */}
      <aside
        aria-label="Restaurant map"
        className={cn(
          "bg-subtle",
          showingMap ? "fixed inset-0 top-header z-20" : "hidden",
          "lg:sticky lg:inset-auto lg:top-0 lg:z-auto lg:block lg:h-full lg:border-l lg:border-line",
        )}
      >
        {/*
         * The map receives only `mappable` restaurants -- those the backend has
         * verified and marked eligible -- and shares the list's selection
         * state, so cards and pins stay synchronised.
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
            // Which surface this is. Drives class names, so it must depend only
            // on React state that is identical on the server and on hydration --
            // never on a media query. Desktop styling comes from lg: variants.
            surfaceMode={showingMap ? "fullscreen" : "inline"}
            // Gestures are captured fully only when the map is the active
            // surface: full-screen on mobile, always on desktop. Behaviour only,
            // so reading a media query here is safe.
            interactive={showingMap || isDesktop}
            anchor={anchor}
            placingPin={placingPin}
            onPlacePin={placePin}
          />
        )}
      </aside>

      {/* Mobile controls, above the map surface. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 lg:hidden">
        {showingMap && selected && (
          <MapPeekSheet
            restaurant={selected}
            anchor={anchor}
            expanded={sheetExpanded}
            onToggleExpanded={() => setSheetExpanded((open) => !open)}
            onDismiss={() => {
              setSheetExpanded(false);
              setSelection(null);
            }}
          />
        )}

        {!(showingMap && selected) && (
          <div className="flex justify-center px-4 pb-6">
            <button
              type="button"
              onClick={() => setView(showingMap ? "list" : "map")}
              className={cn(
                "pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-chip px-6",
                "bg-plum text-sm font-medium text-white",
                "shadow-[0_4px_16px_-4px_rgba(49,40,61,0.45)]",
                "transition-transform duration-200 ease-(--ease-fiyu) active:scale-[0.97]",
              )}
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-lavender-500"
              />
              {showingMap ? "List" : "Map"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

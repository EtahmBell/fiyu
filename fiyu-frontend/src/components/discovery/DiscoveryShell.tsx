"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DailyPicksPanel,
  type ActivePicksDiscoveryLocation,
} from "@/components/daily-picks/DailyPicksPanel";
import { AuthenticatedLocationSetup } from "@/components/location/AuthenticatedLocationSetup";
import { PageIntro, SiteFooter } from "@/components/layout/SiteHeader";
import { FiyuMap } from "@/components/map/FiyuMap";
import { MapUnavailable } from "@/components/map/MapUnavailable";
import { FiyuLoadingScreen } from "@/components/states/FiyuLoadingScreen";
import { Button } from "@/components/ui/Button";
import { fetchDiscoveryLocation } from "@/lib/api/client";
import type { DiscoveryLocation, PublicRestaurant } from "@/lib/api/schemas";
import { mappableRestaurants } from "@/lib/geo/mappable";
import { useGeolocation } from "@/lib/hooks/useGeolocation";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";
import type { LocationAnchor } from "@/lib/api/schemas";
import {
  originAreaName,
  originFromGeolocation,
  type FreeDiscoveryOrigin,
} from "@/lib/location/origin";
import {
  consumePicksReturnState,
  restaurantDetailHref,
  savePicksReturnState,
} from "@/lib/navigation/restaurantDetail";
import { PICKS_DETAIL_MAP_SESSION_KEY } from "@/lib/map/viewportSession";
import { cn } from "@/lib/utils/cn";

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

interface VisibleRestaurantState {
  ownerKey: string;
  restaurantIds: string[];
}

type AccountLocationState =
  | { status: "loading"; userId: string }
  | { status: "configured"; userId: string; location: DiscoveryLocation }
  | { status: "not-configured"; userId: string; location: DiscoveryLocation }
  | { status: "error"; userId: string };

/**
 * Owns the client-side daily-feed selection and map-card synchronization.
 *
 * LAYOUT. Desktop is a true two-pane discovery view: the list column scrolls
 * independently at ~42% while the map holds the remaining ~58% of a
 * viewport-height pane. Mobile keeps the feed primary and floats the same map
 * above it in compact or expanded form.
 *
 * Data arrives already fetched and validated from the server component, so this
 * never touches the network, and ordering is delegated to the ranking adapter.
 */
export function DiscoveryShell({ restaurants, areaAnchors }: DiscoveryShellProps) {
  const router = useRouter();
  const identity = useProfileIdentity();
  const [accountLocationState, setAccountLocationState] =
    useState<AccountLocationState | null>(null);
  const [locationRequestKey, setLocationRequestKey] = useState(0);
  const currentAccountLocationState = identity.profile
    ? accountLocationState?.userId === identity.profile.user_id
      ? accountLocationState
      : ({ status: "loading", userId: identity.profile.user_id } as const)
    : null;
  const accountLocation =
    currentAccountLocationState?.status === "configured"
      ? currentAccountLocationState.location
      : null;
  const [selection, setSelection] = useState<Selection | null>(null);
  const restaurantOwnerKey = identity.profile?.user_id ?? "anonymous";
  const [visibleRestaurantState, setVisibleRestaurantState] =
    useState<VisibleRestaurantState | null>(null);
  const visibleRestaurantIds = useMemo(
    () =>
      visibleRestaurantState?.ownerKey === restaurantOwnerKey
        ? visibleRestaurantState.restaurantIds
        : [],
    [restaurantOwnerKey, visibleRestaurantState],
  );
  const [homeArea, setHomeArea] = useState<LocationAnchor | null>(null);
  const [continuedWithoutLocation, setContinuedWithoutLocation] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const scrollRegionRef = useRef<HTMLDivElement>(null);

  const geolocation = useGeolocation();

  useEffect(() => {
    if (identity.status !== "ready") return;
    if (!identity.profile) return;
    const userId = identity.profile.user_id;
    const controller = new AbortController();
    void fetchDiscoveryLocation({ signal: controller.signal })
      .then((location) => {
        if (controller.signal.aborted) return;
        setAccountLocationState({
          status: location.configured ? "configured" : "not-configured",
          userId,
          location,
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAccountLocationState((current) =>
          current?.userId === userId && current.status !== "loading"
            ? current
            : { status: "error", userId },
        );
      });
    return () => controller.abort();
  }, [identity.profile, identity.status, locationRequestKey]);

  const origin = useMemo<FreeDiscoveryOrigin | null>(() => {
    const current = originFromGeolocation(geolocation.state);
    if (current) return current;
    if (homeArea) return { kind: "home-area", area: homeArea };
    return continuedWithoutLocation ? { kind: "unavailable" } : null;
  }, [continuedWithoutLocation, geolocation.state, homeArea]);
  const activeArea = useMemo(() => {
    if (identity.profile && accountLocation?.configured) {
      return accountLocation.discovery_label;
    }
    return originAreaName(origin, areaAnchors);
  }, [accountLocation, areaAnchors, identity.profile, origin]);
  const activeDiscoveryLocation = useMemo<ActivePicksDiscoveryLocation | null>(() => {
    if (identity.profile && accountLocation?.configured) {
      return {
        mode: accountLocation.location_mode,
        label: accountLocation.discovery_label,
        latitude: accountLocation.discovery_latitude,
        longitude: accountLocation.discovery_longitude,
      };
    }
    if (origin?.kind === "current-location") {
      return {
        mode: "current",
        label: activeArea,
        latitude: origin.point.lat,
        longitude: origin.point.lng,
      };
    }
    if (origin?.kind === "home-area") {
      return {
        mode: "manual",
        label: origin.area.area_name,
        latitude: origin.area.latitude,
        longitude: origin.area.longitude,
      };
    }
    return null;
  }, [accountLocation, activeArea, identity.profile, origin]);

  const visibleRestaurants = useMemo(() => {
    const visible = new Set(visibleRestaurantIds);
    return restaurants.filter((restaurant) => visible.has(restaurant.place_id));
  }, [restaurants, visibleRestaurantIds]);
  const mappable = useMemo(() => mappableRestaurants(visibleRestaurants), [visibleRestaurants]);
  const hasRestaurantMarkers = mappable.length > 0;
  const updateVisibleRestaurantIds = useCallback(
    (restaurantIds: string[]) =>
      setVisibleRestaurantState({ ownerKey: restaurantOwnerKey, restaurantIds }),
    [restaurantOwnerKey],
  );

  const select = useCallback((restaurant: PublicRestaurant, source: SelectionSource) => {
    setSelection((current) => ({
      placeId: restaurant.place_id,
      source,
      navigationKey: (current?.navigationKey ?? 0) + 1,
    }));
  }, []);

  const selectFromFeed = useCallback(
    (restaurant: PublicRestaurant) => {
      setSelection((current) =>
        current?.placeId === restaurant.place_id
          ? null
          : {
              placeId: restaurant.place_id,
              source: "feed",
              navigationKey: (current?.navigationKey ?? 0) + 1,
            },
      );
    },
    [],
  );
  const selectFromMap = useCallback(
    (restaurant: PublicRestaurant) => select(restaurant, "map"),
    [select],
  );

  const openRestaurantDetail = useCallback(
    (restaurant: PublicRestaurant) => {
      savePicksReturnState({
        placeId: restaurant.place_id,
        scrollTop: scrollRegionRef.current?.scrollTop ?? 0,
        createdAt: Date.now(),
      });
      setSelection((current) => ({
        placeId: restaurant.place_id,
        source: "feed",
        navigationKey: (current?.navigationKey ?? 0) + 1,
      }));
      router.push(restaurantDetailHref(restaurant.place_id), { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    const restore = consumePicksReturnState();
    const scrollRegion = scrollRegionRef.current;
    if (!restore || !scrollRegion) return;

    setSelection((current) => ({
      placeId: restore.placeId,
      source: "feed",
      navigationKey: (current?.navigationKey ?? 0) + 1,
    }));

    const restoreCard = () => {
      const card = [...document.querySelectorAll<HTMLElement>("[data-daily-card-place-id]")].find(
        (candidate) => candidate.dataset.dailyCardPlaceId === restore.placeId,
      );
      if (!card) return false;
      scrollRegion.scrollTop = restore.scrollTop;
      card.focus({ preventScroll: true });
      return true;
    };

    if (restoreCard()) return;
    const observer = new MutationObserver(() => {
      if (restoreCard()) observer.disconnect();
    });
    observer.observe(scrollRegion, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!mapExpanded) return;
    const collapseOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMapExpanded(false);
    };
    window.addEventListener("keydown", collapseOnEscape);
    return () => window.removeEventListener("keydown", collapseOnEscape);
  }, [mapExpanded]);

  if (identity.status === "loading" || currentAccountLocationState?.status === "loading") {
    return <FiyuLoadingScreen />;
  }

  if (identity.profile && currentAccountLocationState?.status === "error") {
    return (
      <div className="flex min-h-[calc(100dvh-var(--spacing-header))] items-center justify-center bg-canvas px-5">
        <div className="max-w-sm text-center">
          <p className="font-display text-2xl text-ink">We couldn&apos;t load your location.</p>
          <Button
            variant="secondary"
            className="mt-5"
            onClick={() => {
              setAccountLocationState({ status: "loading", userId: identity.profile!.user_id });
              setLocationRequestKey((key) => key + 1);
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (identity.profile && currentAccountLocationState?.status === "not-configured") {
    return (
      <AuthenticatedLocationSetup
        anchors={areaAnchors}
        geolocation={geolocation}
        onConfigured={(location) =>
          setAccountLocationState({
            status: "configured",
            userId: identity.profile!.user_id,
            location,
          })
        }
      />
    );
  }

  return (
    <div
      data-testid="discovery-layout"
      className="grid h-[calc(100dvh-var(--spacing-header))] min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden bg-canvas lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)] lg:grid-rows-1"
    >
      <section
        className="contents lg:col-start-1 lg:row-start-1 lg:block lg:min-h-0 lg:min-w-0 lg:overflow-y-auto lg:overscroll-contain"
      >
        <div data-testid="desktop-page-intro" className="hidden px-5 sm:px-8 lg:block">
          <PageIntro />
        </div>

        {/* The feed remains the primary scroll surface behind the floating map. */}
        <div
          ref={scrollRegionRef}
          data-testid="restaurant-scroll-region"
          className="row-start-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain lg:w-full lg:overflow-visible"
        >
          <div
            className={cn(
              "relative isolate mx-auto min-w-0 w-full max-w-[38rem] px-5 sm:px-8 lg:mx-0 lg:max-w-none lg:pb-10",
              hasRestaurantMarkers
                ? "pb-[calc(17rem+env(safe-area-inset-bottom))]"
                : "pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
            )}
          >
            {/*
              * The hairline under the heading belongs to the discovery context
              * that follows it, so the masthead and its standfirst read as one
              * block rather than two stacked rules.
              */}
            <header data-testid="mobile-picks-page-header" className="pt-5 pb-2 lg:hidden">
              <h1 className="font-display text-[1.75rem] leading-none text-ink">Picks</h1>
            </header>

            <div className="relative z-10 min-w-0 w-full">
              <DailyPicksPanel
                key={identity.profile?.user_id ?? "anonymous"}
                restaurants={restaurants}
                accountId={identity.profile?.user_id ?? null}
                activeDiscoveryLocation={activeDiscoveryLocation}
                onOpenRestaurant={selectFromFeed}
                onViewRestaurant={openRestaurantDetail}
                onVisibleRestaurantIdsChange={updateVisibleRestaurantIds}
                selectedPlaceId={selection?.placeId ?? null}
                scrollToPlaceId={selection?.source === "map" ? selection.placeId : null}
                scrollRequestKey={selection?.navigationKey ?? 0}
                originSetup={
                  identity.profile
                    ? undefined
                    : {
                        origin,
                        geolocation: geolocation.state,
                        areaAnchors,
                        requestCurrentLocation: geolocation.request,
                        chooseHomeArea: setHomeArea,
                        continueWithoutLocation: () => setContinuedWithoutLocation(true),
                      }
                }
              />
            </div>

            <SiteFooter />
          </div>
        </div>
      </section>

      {/* Floating mini-map on mobile; the existing side-by-side pane on desktop. */}
      <aside
        aria-label="Restaurant map"
        data-testid={hasRestaurantMarkers ? "mobile-map-region" : "desktop-map-region"}
        data-expanded={mapExpanded ? "true" : "false"}
        className={cn(
          "fixed right-4 z-20 min-h-0 min-w-0 overflow-hidden rounded-card border border-line-strong bg-subtle shadow-[0_10px_32px_-12px_rgba(49,40,61,0.45)] transition-[width,height] duration-200 ease-(--ease-fiyu)",
          "bottom-[calc(var(--spacing-mobile-nav)+0.75rem)]",
          !hasRestaurantMarkers && "hidden lg:block",
          mapExpanded
            ? "left-4 h-[min(50dvh,32rem)]"
            : "size-[clamp(9rem,40vw,10.5rem)] max-[360px]:size-[8.75rem]",
          "lg:static lg:col-start-2 lg:row-start-1 lg:h-full lg:w-auto lg:rounded-none lg:border-y-0 lg:border-r-0 lg:border-l lg:shadow-none lg:transition-none",
        )}
      >
        {/*
         * The map receives individually revealed current picks and active
         * Recent Discoveries that the backend marked map-eligible. Concealed
         * assignments stay absent until their own reveal action.
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
            compactOnMobile={!mapExpanded}
            viewportSessionKey={PICKS_DETAIL_MAP_SESSION_KEY}
          />
        )}

        {hasRestaurantMarkers && (
          <button
            type="button"
            aria-label={mapExpanded ? "Collapse map" : "Expand map"}
            onClick={() => setMapExpanded((expanded) => !expanded)}
            className="absolute top-2 left-2 z-30 min-h-9 rounded-chip border border-white/80 bg-plum/90 px-3 text-xs font-medium text-white shadow-sm backdrop-blur-sm hover:bg-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600 lg:hidden"
          >
            {mapExpanded ? "Collapse map" : "Expand map"}
          </button>
        )}
      </aside>
    </div>
  );
}

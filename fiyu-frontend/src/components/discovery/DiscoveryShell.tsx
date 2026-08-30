"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DailyPicksPanel,
  type ActivePicksDiscoveryLocation,
  type NewRoundLocationResolution,
} from "@/components/daily-picks/DailyPicksPanel";
import { AuthenticatedLocationSetup } from "@/components/location/AuthenticatedLocationSetup";
import { PageIntro, SiteFooter } from "@/components/layout/SiteHeader";
import { FiyuMap } from "@/components/map/FiyuMap";
import { MapUnavailable } from "@/components/map/MapUnavailable";
import { FiyuLoadingScreen } from "@/components/states/FiyuLoadingScreen";
import { Button } from "@/components/ui/Button";
import {
  checkCurrentDiscoveryLocation,
  fetchAuthenticatedMapRestaurants,
  fetchDiscoveryLocation,
} from "@/lib/api/client";
import { useAccountQuery } from "@/lib/accountQueryCache";
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

interface Selection {
  placeId: string;
  source: "feed" | "map";
  navigationKey: number;
}

interface VisibleRestaurantState {
  ownerKey: string;
  restaurants: PublicRestaurant[];
}

type NewRoundLocationGate =
  | "outside_tokyo_needs_preview_area"
  | "location_unavailable";

/**
 * Owns the client-side daily-feed selection and map-card synchronization.
 *
 * Desktop uses a two-pane feed and Map. On mobile the feed stands alone and
 * the dedicated Map tab owns map presentation.
 *
 * Data arrives already fetched and validated from the server component, so this
 * never touches the network, and ordering is delegated to the ranking adapter.
 */
export function DiscoveryShell({ restaurants, areaAnchors }: DiscoveryShellProps) {
  const router = useRouter();
  const identity = useProfileIdentity();
  const authenticatedUserId = identity.profile?.user_id ?? null;
  const loadDiscoveryLocation = useCallback(() => fetchDiscoveryLocation(), []);
  const locationQuery = useAccountQuery<DiscoveryLocation>({
    resource: "discovery-location",
    accountId: identity.status === "loading" || !authenticatedUserId
      ? undefined
      : authenticatedUserId,
    loader: loadDiscoveryLocation,
    enabled: Boolean(authenticatedUserId),
  });
  const setDiscoveryLocation = locationQuery.setData;
  const accountLocation = locationQuery.status === "ready" && locationQuery.data.configured
    ? locationQuery.data
    : null;
  const [selection, setSelection] = useState<Selection | null>(null);
  const restaurantOwnerKey = identity.profile?.user_id ?? "anonymous";
  const [visibleRestaurantState, setVisibleRestaurantState] =
    useState<VisibleRestaurantState | null>(null);
  const visibleRestaurants = useMemo(
    () =>
      visibleRestaurantState?.ownerKey === restaurantOwnerKey
        ? visibleRestaurantState.restaurants
        : [],
    [restaurantOwnerKey, visibleRestaurantState],
  );
  const loadMapRestaurants = useCallback(() => fetchAuthenticatedMapRestaurants(), []);
  const mapQuery = useAccountQuery<PublicRestaurant[]>({
    resource: "map-restaurants",
    accountId: identity.status === "loading" || !authenticatedUserId
      ? undefined
      : authenticatedUserId,
    loader: loadMapRestaurants,
    enabled: Boolean(authenticatedUserId),
  });
  const refreshMapRestaurants = mapQuery.refresh;
  const setMapRestaurants = mapQuery.setData;
  const [homeArea, setHomeArea] = useState<LocationAnchor | null>(null);
  const [continuedWithoutLocation, setContinuedWithoutLocation] = useState(false);
  const [newRoundLocationGate, setNewRoundLocationGate] =
    useState<NewRoundLocationGate | null>(null);
  const pendingLocationResolutionRef = useRef<
    ((resolution: NewRoundLocationResolution) => void) | null
  >(null);
  const pendingLocationOwnerRef = useRef<string | null>(null);
  // A preview is valid for fresh outside-Tokyo generation only after the user
  // explicitly chooses it during this mounted account session. Persisted
  // discovery locations are presentation/history state, not proof of consent
  // to reuse an old preview for a new round.
  const outsidePreviewRef = useRef<{
    ownerId: string;
    location: ActivePicksDiscoveryLocation;
  } | null>(null);
  const scrollRegionRef = useRef<HTMLDivElement>(null);

  const geolocation = useGeolocation();
  const requestFreshGeolocation = geolocation.requestFresh;

  const waitForTokyoArea = useCallback(
    (status: NewRoundLocationGate, userId: string) =>
      new Promise<NewRoundLocationResolution>((resolve) => {
        pendingLocationResolutionRef.current = resolve;
        pendingLocationOwnerRef.current = userId;
        setNewRoundLocationGate(status);
      }),
    [],
  );

  useEffect(() => {
    if (outsidePreviewRef.current?.ownerId !== authenticatedUserId) {
      outsidePreviewRef.current = null;
    }
    if (
      !pendingLocationOwnerRef.current ||
      pendingLocationOwnerRef.current === authenticatedUserId
    ) {
      return;
    }
    pendingLocationResolutionRef.current?.({
      status: "location_unavailable",
      location: null,
    });
    pendingLocationResolutionRef.current = null;
    pendingLocationOwnerRef.current = null;
    setNewRoundLocationGate(null);
  }, [authenticatedUserId]);

  const resolveNewRoundLocation = useCallback(async (): Promise<NewRoundLocationResolution> => {
    const requestUserId = authenticatedUserId;
    if (!requestUserId) {
      return { status: "location_unavailable", location: null };
    }
    const fresh = await requestFreshGeolocation();
    if (authenticatedUserId !== requestUserId) {
      return { status: "location_unavailable", location: null };
    }
    if (fresh.status !== "granted") {
      return waitForTokyoArea("location_unavailable", requestUserId);
    }
    try {
      const result = await checkCurrentDiscoveryLocation(fresh.point.lat, fresh.point.lng);
      if (authenticatedUserId !== requestUserId) {
        return { status: "location_unavailable", location: null };
      }
      if (result.inside_service_area) {
        outsidePreviewRef.current = null;
        setDiscoveryLocation(result.location);
        return {
          status: "in_tokyo_live_gps",
          location: {
            mode: "current",
            label: result.location.discovery_label,
            latitude: fresh.point.lat,
            longitude: fresh.point.lng,
          },
        };
      }
      const sessionPreview = outsidePreviewRef.current;
      if (sessionPreview?.ownerId === requestUserId) {
        setDiscoveryLocation(result.location);
        return {
          status: "outside_tokyo_with_preview_area",
          location: sessionPreview.location,
        };
      }
      return waitForTokyoArea("outside_tokyo_needs_preview_area", requestUserId);
    } catch {
      return waitForTokyoArea("location_unavailable", requestUserId);
    }
  }, [
    authenticatedUserId,
    requestFreshGeolocation,
    setDiscoveryLocation,
    waitForTokyoArea,
  ]);

  const finishNewRoundLocationGate = useCallback((location: DiscoveryLocation) => {
    const ownerId = pendingLocationOwnerRef.current;
    const previewLocation: ActivePicksDiscoveryLocation = {
      mode: location.location_mode,
      label: location.discovery_label,
      latitude: location.discovery_latitude,
      longitude: location.discovery_longitude,
    };
    if (ownerId && location.location_mode !== "current") {
      outsidePreviewRef.current = { ownerId, location: previewLocation };
    }
    setDiscoveryLocation(location);
    setNewRoundLocationGate(null);
    const resolve = pendingLocationResolutionRef.current;
    pendingLocationResolutionRef.current = null;
    pendingLocationOwnerRef.current = null;
    resolve?.({
      status: "outside_tokyo_with_preview_area",
      location: previewLocation,
    });
  }, [setDiscoveryLocation]);

  const showPreviewAreaGate = useCallback(() => {
    if (!authenticatedUserId) return;
    pendingLocationOwnerRef.current = authenticatedUserId;
    setNewRoundLocationGate("outside_tokyo_needs_preview_area");
  }, [authenticatedUserId]);

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

  const mappable = useMemo(() => {
    const mapRestaurants = identity.profile
      ? mapQuery.status === "ready"
        ? [...new Map([...mapQuery.data, ...visibleRestaurants].map((restaurant) => [
            restaurant.place_id,
            restaurant,
          ])).values()]
        : mapQuery.status === "error"
          ? visibleRestaurants
          : []
      : visibleRestaurants;
    return mappableRestaurants(mapRestaurants);
  }, [identity.profile, mapQuery.data, mapQuery.status, visibleRestaurants]);
  const selectedMapRestaurant = selection?.source === "map"
    ? mappable.find((restaurant) => restaurant.place_id === selection.placeId) ?? null
    : null;
  const updateVisibleRestaurants = useCallback(
    (nextRestaurants: PublicRestaurant[]) =>
      setVisibleRestaurantState({ ownerKey: restaurantOwnerKey, restaurants: nextRestaurants }),
    [restaurantOwnerKey],
  );
  const reconcileMapForNewRound = useCallback(
    (previousUnrevealedPlaceIds: string[]) => {
      const staleIds = new Set(previousUnrevealedPlaceIds);
      if (staleIds.size > 0) {
        setMapRestaurants((current) =>
          (current ?? []).filter(
            (restaurant) =>
              ("is_visited" in restaurant && restaurant.is_visited === true) ||
              !staleIds.has(restaurant.place_id),
          ),
        );
      }
      void refreshMapRestaurants(true).catch(() => undefined);
    },
    [refreshMapRestaurants, setMapRestaurants],
  );

  useEffect(() => {
    for (const restaurant of visibleRestaurants.slice(0, 8)) {
      router.prefetch?.(restaurantDetailHref(restaurant.place_id));
    }
  }, [router, visibleRestaurants]);

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
  const selectFromMap = useCallback((restaurant: PublicRestaurant) => {
    setSelection((current) => ({
      placeId: restaurant.place_id,
      source: "map",
      navigationKey: (current?.navigationKey ?? 0) + 1,
    }));
  }, []);
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

  if (
    identity.status === "loading" ||
    (authenticatedUserId && locationQuery.status === "loading")
  ) {
    return <FiyuLoadingScreen />;
  }

  if (identity.profile && locationQuery.status === "error") {
    return (
      <div className="flex min-h-[calc(100dvh-var(--spacing-header))] items-center justify-center bg-canvas px-5">
        <div className="max-w-sm text-center">
          <p className="font-display text-2xl text-ink">We couldn&apos;t load your location.</p>
          <Button
            variant="secondary"
            className="mt-5"
            onClick={() => {
              void locationQuery.refresh(true).catch(() => undefined);
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (
    identity.profile &&
    locationQuery.status === "ready" &&
    !locationQuery.data.configured
  ) {
    return (
      <AuthenticatedLocationSetup
        anchors={areaAnchors}
        geolocation={geolocation}
        onConfigured={setDiscoveryLocation}
      />
    );
  }

  return (
    <>
      {newRoundLocationGate && (
        <AuthenticatedLocationSetup
          anchors={areaAnchors}
          geolocation={geolocation}
          confirmedOutsideTokyo={
            newRoundLocationGate === "outside_tokyo_needs_preview_area"
          }
          onConfigured={finishNewRoundLocationGate}
        />
      )}
    <div
      data-testid="discovery-layout"
      className={cn(
        "grid h-[calc(100dvh-var(--spacing-header))] min-h-0 grid-cols-1 overflow-hidden bg-canvas lg:grid-cols-[minmax(0,44fr)_minmax(0,56fr)] xl:grid-cols-[minmax(0,40fr)_minmax(0,60fr)]",
        newRoundLocationGate && "hidden",
      )}
    >
      <section
        className="contents lg:block lg:min-h-0 lg:min-w-0 lg:overflow-y-auto lg:overscroll-contain"
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
              "pb-[calc(var(--spacing-mobile-nav)+1.5rem)] lg:mx-auto lg:max-w-[48rem] lg:pb-10",
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
                resolveNewRoundLocation={identity.profile ? resolveNewRoundLocation : undefined}
                onPreviewAreaRequired={identity.profile ? showPreviewAreaGate : undefined}
                onOpenRestaurant={selectFromFeed}
                onViewRestaurant={openRestaurantDetail}
                onVisibleRestaurantsChange={updateVisibleRestaurants}
                onActiveRoundAssigned={reconcileMapForNewRound}
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

      <aside
        aria-label="Restaurant map"
        data-testid="desktop-map-region"
        className="hidden min-h-0 min-w-0 overflow-hidden border-l border-line-strong bg-subtle lg:sticky lg:top-header lg:block lg:h-[calc(100dvh-var(--spacing-header))]"
      >
        {identity.profile && mapQuery.status === "loading" ? (
          <div className="flex h-full items-center justify-center" role="status">
            <p className="text-sm text-ink-muted">Loading your map…</p>
          </div>
        ) : mappable.length === 0 ? (
          <MapUnavailable reason="no-mapped-restaurants" className="h-full" />
        ) : (
          <FiyuMap
            restaurants={mappable}
            selectedPlaceId={selection?.placeId ?? null}
            onSelect={selectFromMap}
            onMapBackgroundClick={() => setSelection(null)}
            showSelectedRestaurantPopup={selectedMapRestaurant?.is_visited === true}
            surfaceMode="bounded"
            interactive
            clusterNearbyRestaurants={false}
            viewportSessionKey={PICKS_DETAIL_MAP_SESSION_KEY}
          />
        )}
      </aside>

    </div>
    </>
  );
}

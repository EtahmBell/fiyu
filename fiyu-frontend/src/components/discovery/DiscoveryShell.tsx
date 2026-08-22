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

interface Selection {
  placeId: string;
  source: "feed" | "map";
  navigationKey: number;
}

interface VisibleRestaurantState {
  ownerKey: string;
  restaurants: PublicRestaurant[];
}

type AccountLocationState =
  | { status: "loading"; userId: string }
  | { status: "configured"; userId: string; location: DiscoveryLocation }
  | { status: "not-configured"; userId: string; location: DiscoveryLocation }
  | { status: "error"; userId: string };

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
  const visibleRestaurants = useMemo(
    () =>
      visibleRestaurantState?.ownerKey === restaurantOwnerKey
        ? visibleRestaurantState.restaurants
        : [],
    [restaurantOwnerKey, visibleRestaurantState],
  );
  const [homeArea, setHomeArea] = useState<LocationAnchor | null>(null);
  const [continuedWithoutLocation, setContinuedWithoutLocation] = useState(false);
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

  const mappable = useMemo(() => mappableRestaurants(visibleRestaurants), [visibleRestaurants]);
  const updateVisibleRestaurants = useCallback(
    (nextRestaurants: PublicRestaurant[]) =>
      setVisibleRestaurantState({ ownerKey: restaurantOwnerKey, restaurants: nextRestaurants }),
    [restaurantOwnerKey],
  );

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
      className="grid h-[calc(100dvh-var(--spacing-header))] min-h-0 grid-cols-1 overflow-hidden bg-canvas lg:grid-cols-[minmax(0,44fr)_minmax(0,56fr)] xl:grid-cols-[minmax(0,40fr)_minmax(0,60fr)]"
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
              "pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-[48rem] lg:pb-10",
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
                onVisibleRestaurantsChange={updateVisibleRestaurants}
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
        {mappable.length === 0 ? (
          <MapUnavailable reason="no-mapped-restaurants" className="h-full" />
        ) : (
          <FiyuMap
            restaurants={mappable}
            selectedPlaceId={selection?.placeId ?? null}
            onSelect={selectFromMap}
            surfaceMode="bounded"
            interactive
            clusterNearbyRestaurants={false}
            viewportSessionKey={PICKS_DETAIL_MAP_SESSION_KEY}
          />
        )}
      </aside>

    </div>
  );
}

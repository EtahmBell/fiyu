"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { FiyuMap } from "@/components/map/FiyuMap";
import { FiyuLoadingScreen } from "@/components/states/FiyuLoadingScreen";
import { fetchAuthenticatedMapRestaurants, fetchMapRestaurants } from "@/lib/api/client";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { mappableRestaurants } from "@/lib/geo/mappable";
import { getOrCreateAnonymousOwnerKey } from "@/lib/lists/identity";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";

type MapState =
  | { status: "loading"; ownerKey: string }
  | { status: "ready"; ownerKey: string; restaurants: PublicRestaurant[] }
  | { status: "error"; ownerKey: string };

export function DedicatedMap() {
  const identity = useProfileIdentity();
  const [anonymousOwnerKey] = useState<string | null>(() =>
    typeof window === "undefined" ? null : getOrCreateAnonymousOwnerKey(),
  );
  const ownerKey =
    identity.status === "ready"
      ? identity.profile?.user_id ??
        (identity.email === null && anonymousOwnerKey ? `anonymous:${anonymousOwnerKey}` : null)
      : null;
  const [mapState, setMapState] = useState<MapState | null>(null);
  const currentMapState =
    ownerKey && mapState?.ownerKey === ownerKey
      ? mapState
      : ownerKey
        ? ({ status: "loading", ownerKey } as const)
        : null;
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!ownerKey) return;
    const controller = new AbortController();
    const request = ownerKey.startsWith("anonymous:")
      ? fetchMapRestaurants(
          { clientId: ownerKey.slice("anonymous:".length) },
          { signal: controller.signal },
        )
      : fetchAuthenticatedMapRestaurants({ signal: controller.signal });
    void request
      .then((restaurants) => {
        if (controller.signal.aborted) return;
        setSelectedPlaceId(null);
        setMapState({ status: "ready", ownerKey, restaurants });
      })
      .catch(() => {
        if (!controller.signal.aborted) setMapState({ status: "error", ownerKey });
      });
    return () => controller.abort();
  }, [ownerKey]);

  const mappable =
    currentMapState?.status === "ready"
      ? mappableRestaurants(currentMapState.restaurants)
      : [];

  if (identity.status === "loading" || !ownerKey || currentMapState?.status === "loading") {
    return <FiyuLoadingScreen />;
  }

  return (
    <main className="relative h-[calc(100dvh-var(--spacing-header)-var(--spacing-mobile-nav))] min-h-[22rem] overflow-hidden bg-subtle lg:h-[calc(100dvh-var(--spacing-header))]">
      <div className="absolute top-4 left-4 z-20 rounded-card border border-line bg-surface/95 px-4 py-3 shadow-lg backdrop-blur-sm">
        <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-lavender-700 uppercase">
          Tokyo edition
        </p>
        <h1 className="mt-1 font-display text-2xl leading-none text-ink">Your map</h1>
      </div>

      {currentMapState?.status === "error" ? (
        <div className="flex h-full items-center justify-center px-5 text-center">
          <p className="text-sm text-ink-muted">We couldn&apos;t load your discoveries.</p>
        </div>
      ) : (
        <>
          <FiyuMap
            restaurants={mappable}
            selectedPlaceId={selectedPlaceId}
            onSelect={(restaurant) => setSelectedPlaceId(restaurant.place_id)}
            surfaceMode="fullscreen"
            interactive
            showContextMarks={false}
          />
          {mappable.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-5">
              <div className="pointer-events-auto w-full max-w-lg rounded-card border border-line bg-surface/95 px-6 py-10 text-center backdrop-blur-sm">
                <h2 className="font-display text-3xl text-ink">No places yet</h2>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-ink-muted">
                  Your Fiyu discoveries will appear here as you receive Picks.
                </p>
                <Link href="/picks" className="mt-5 inline-flex min-h-11 items-center font-medium text-lavender-700 underline underline-offset-4">
                  Go to Picks
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

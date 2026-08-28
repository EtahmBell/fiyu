"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { FiyuMap } from "@/components/map/FiyuMap";
import { FiyuLoadingScreen } from "@/components/states/FiyuLoadingScreen";
import { fetchAuthenticatedMapRestaurants } from "@/lib/api/client";
import { useAccountQuery } from "@/lib/accountQueryCache";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { mappableRestaurants } from "@/lib/geo/mappable";
import { useIsDesktop } from "@/lib/hooks/useMediaQuery";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";

export function DedicatedMap() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const identity = useProfileIdentity();
  const ownerKey = identity.profile?.user_id ?? null;
  const loadMap = useCallback(() => fetchAuthenticatedMapRestaurants(), []);
  const map = useAccountQuery<PublicRestaurant[]>({
    resource: "map-restaurants",
    accountId: identity.status === "loading" ? undefined : ownerKey,
    loader: loadMap,
    enabled: !isDesktop && Boolean(ownerKey),
  });
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  useEffect(() => {
    if (isDesktop) router.replace("/picks");
  }, [isDesktop, router]);

  useEffect(() => {
    if (!selectedPlaceId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedPlaceId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedPlaceId]);

  const mappable =
    ownerKey && map.status === "ready"
      ? mappableRestaurants(map.data)
      : [];

  if (isDesktop || identity.status === "loading") {
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

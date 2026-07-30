import type { Metadata } from "next";

import { DedicatedMap } from "@/components/destinations/DedicatedMap";
import { BackendUnavailable } from "@/components/states/BackendUnavailable";
import { fetchRestaurants } from "@/lib/api/client";
import { type FiyuApiError, isFiyuApiError } from "@/lib/api/errors";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { selectBrowsable } from "@/lib/discovery/filters";

export const metadata: Metadata = {
  title: "Map",
};

type MapCatalogResult =
  | { ok: true; restaurants: PublicRestaurant[] }
  | { ok: false; error: FiyuApiError };

async function loadMapCatalog(): Promise<MapCatalogResult> {
  try {
    const result = await fetchRestaurants(100);
    const { restaurants } = selectBrowsable(result.restaurants);
    return { ok: true, restaurants };
  } catch (error) {
    if (!isFiyuApiError(error)) throw error;
    return { ok: false, error };
  }
}

export default async function MapPage() {
  const result = await loadMapCatalog();

  if (result.ok) return <DedicatedMap restaurants={result.restaurants} />;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 items-center px-5 py-16 pb-[calc(var(--spacing-mobile-nav)+2rem)] sm:px-8 lg:pb-16">
      <BackendUnavailable error={result.error} />
    </main>
  );
}

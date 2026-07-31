import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RestaurantDetailShell } from "@/components/restaurant-detail/RestaurantDetailShell";
import { BackendUnavailable } from "@/components/states/BackendUnavailable";
import { fetchRestaurant, fetchRestaurants } from "@/lib/api/client";
import { isFiyuApiError } from "@/lib/api/errors";
import type { PublicRestaurant } from "@/lib/api/schemas";

export const metadata: Metadata = { title: "Restaurant" };

export default async function RestaurantDetailPage({
  params,
}: {
  params: Promise<{ placeId: string }>;
}) {
  const { placeId } = await params;

  let restaurant;
  try {
    restaurant = await fetchRestaurant(placeId);
  } catch (error) {
    if (isFiyuApiError(error) && error.kind === "not-found") notFound();
    if (isFiyuApiError(error)) {
      return (
        <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
          <BackendUnavailable error={error} />
        </main>
      );
    }
    throw error;
  }

  let restaurants: PublicRestaurant[] = [restaurant];
  try {
    const catalog = await fetchRestaurants(100);
    const byId = new Map(catalog.restaurants.map((candidate) => [candidate.place_id, candidate]));
    byId.set(restaurant.place_id, restaurant);
    restaurants = [...byId.values()];
  } catch {
    // The detail remains useful when the broader map catalog is temporarily
    // unavailable. Its own selected pin still renders when it is eligible.
  }

  return <RestaurantDetailShell restaurant={restaurant} restaurants={restaurants} />;
}

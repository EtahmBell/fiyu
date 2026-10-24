import { router } from "expo-router";

import { PicksView } from "@/components/PicksView";
import { useRestaurants } from "@/api/queries";

export default function PicksScreen() {
  const query = useRestaurants();
  return (
    <PicksView
      data={query.data}
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
      onOpenRestaurant={(placeId) => router.push({ pathname: "/restaurants/[placeId]", params: { placeId } })}
    />
  );
}

import type { DefaultListResponse, RestaurantVisit } from "@fiyu/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";

import { addToDefaultList, createRestaurantVisit, fetchDefaultList, fetchRestaurantLog, removeFromDefaultList } from "@/api/client";
import { PICKS_CITY_ID, picksKeys } from "@/api/queries";

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useRestaurantRelationships() {
  const queryClient = useQueryClient();
  const saveGuard = useRef(false);
  const visitGuard = useRef(false);
  const savedQuery = useQuery({ queryKey: picksKeys.saved, queryFn: () => fetchDefaultList(PICKS_CITY_ID) });
  const logQuery = useQuery({ queryKey: picksKeys.log, queryFn: fetchRestaurantLog });
  const savedIds = useMemo(() => new Set(savedQuery.data?.items.map((item) => item.place_id) ?? []), [savedQuery.data]);
  const visitsByPlace = useMemo(() => new Map(logQuery.data?.map((visit) => [visit.place_id, visit]) ?? []), [logQuery.data]);

  const save = useMutation({
    mutationFn: ({ placeId, saved }: { placeId: string; saved: boolean }) => saved
      ? removeFromDefaultList(PICKS_CITY_ID, placeId)
      : addToDefaultList(PICKS_CITY_ID, placeId),
    onSuccess: (response) => {
      queryClient.setQueryData<DefaultListResponse>(picksKeys.saved, response.list);
      void queryClient.invalidateQueries({ queryKey: picksKeys.map });
    },
    onSettled: () => { saveGuard.current = false; },
  });
  const visit = useMutation({
    mutationFn: ({ placeId, rating, note }: { placeId: string; rating: 1 | 2 | 3 | 4 | 5; note: string | null }) => createRestaurantVisit({
      place_id: placeId,
      visited_at: new Date().toISOString(),
      rating,
      private_note: note,
    }),
    onSuccess: (created) => {
      queryClient.setQueryData<RestaurantVisit[]>(picksKeys.log, (prior = []) => [created, ...prior.filter((item) => item.place_id !== created.place_id)]);
      void queryClient.invalidateQueries({ queryKey: picksKeys.personalized });
      void queryClient.invalidateQueries({ queryKey: picksKeys.map });
    },
    onSettled: () => { visitGuard.current = false; },
  });

  return {
    savedIds,
    visitsByPlace,
    loading: savedQuery.isLoading || logQuery.isLoading,
    savePendingPlaceId: save.isPending ? save.variables?.placeId ?? null : null,
    visitPendingPlaceId: visit.isPending ? visit.variables?.placeId ?? null : null,
    saveError: save.error ? message(save.error, "Saved places could not be updated.") : null,
    visitError: visit.error ? message(visit.error, "Your visit could not be saved.") : null,
    refetch: () => Promise.all([savedQuery.refetch(), logQuery.refetch()]),
    toggleSaved(placeId: string) {
      if (saveGuard.current) return;
      saveGuard.current = true;
      save.mutate({ placeId, saved: savedIds.has(placeId) });
    },
    logVisit(placeId: string, rating: 1 | 2 | 3 | 4 | 5, note: string | null, onSuccess?: () => void) {
      if (visitGuard.current) return;
      visitGuard.current = true;
      visit.mutate({ placeId, rating, note }, { onSuccess });
    },
  };
}

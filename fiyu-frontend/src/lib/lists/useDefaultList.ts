"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import { defaultListStoreForCity } from "@/lib/lists/defaultListStore";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";

export function useDefaultList(
  cityId: string,
  options: { enabled?: boolean; accountId?: string | null } = {},
) {
  const profileIdentity = useProfileIdentity();
  const accountIdWasProvided = options.accountId !== undefined;
  const accountId = accountIdWasProvided
    ? options.accountId ?? null
    : profileIdentity.profile?.user_id ?? null;
  const store = useMemo(() => defaultListStoreForCity(cityId, accountId), [accountId, cityId]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const identityResolved = accountIdWasProvided || profileIdentity.status === "ready";
  const enabled = (options.enabled ?? true) && identityResolved;

  useEffect(() => {
    if (!enabled) return;
    void store.ensureLoaded();
  }, [enabled, store]);

  return {
    ...snapshot,
    ensureLoaded: () => store.ensureLoaded(),
    retry: () => store.retry(),
    toggle: (placeId: string) => store.toggle(placeId),
    isSaved: (placeId: string) => store.isSaved(placeId),
  };
}

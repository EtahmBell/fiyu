"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import { defaultListStoreForCity } from "@/lib/lists/defaultListStore";

export function useDefaultList(
  cityId: string,
  options: { enabled?: boolean; accountId?: string | null } = {},
) {
  const accountId = options.accountId ?? null;
  const store = useMemo(() => defaultListStoreForCity(cityId, accountId), [accountId, cityId]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const enabled = options.enabled ?? true;

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

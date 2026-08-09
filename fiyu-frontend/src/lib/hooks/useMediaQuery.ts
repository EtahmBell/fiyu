"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Track a CSS media query.
 *
 * `useSyncExternalStore` is the right tool here: matchMedia is external state,
 * so subscribing to it directly avoids the cascading render that a
 * setState-in-effect would cause, and gives React a correct server snapshot.
 *
 * The server snapshot is always false, so callers must treat false as "not yet
 * known" rather than "definitely not matching". Use this only to *enable*
 * desktop behaviour, never to hide content that mobile users need.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener("change", onStoreChange);
      return () => list.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Matches Tailwind's `lg` breakpoint, where the split view appears. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 64rem)");
}

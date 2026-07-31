import type { MapView } from "@/lib/map/viewport";

export const PICKS_DETAIL_MAP_SESSION_KEY = "picks-detail";

export interface MapViewportSession {
  resultKey: string;
  view: MapView;
}

const sessions = new Map<string, MapViewportSession>();

export function readMapViewportSession(key: string): MapViewportSession | null {
  if (typeof window === "undefined") return null;
  return sessions.get(key) ?? null;
}

export function saveMapViewportSession(key: string, session: MapViewportSession): void {
  if (typeof window === "undefined") return;
  sessions.set(key, session);
}

/** Test-only reset without exposing the mutable session map. */
export function clearMapViewportSessions(): void {
  sessions.clear();
}

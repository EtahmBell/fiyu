"use client";

import { useCallback, useRef, useState } from "react";

import type { LatLng } from "@/lib/map/projection";

/**
 * Browser geolocation, requested only on an explicit user action.
 *
 * This hook never asks for a position on mount. The permission prompt appears
 * solely because someone pressed the button, after the UI has explained why.
 *
 * The position is held in React state. A caller may submit a successful point
 * as the account's single active discovery center; this hook never stores or
 * tracks a history itself.
 */

export type GeolocationState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "granted"; point: LatLng; accuracyMeters: number | null }
  /** The user refused. Asking again will not help until they change it. */
  | { status: "denied" }
  /** No geolocation support, or the device could not get a fix. */
  | { status: "unavailable" }
  | { status: "timeout" };

const TIMEOUT_MS = 10_000;

export interface UseGeolocation {
  state: GeolocationState;
  request: () => void;
  requestFresh: () => Promise<GeolocationState>;
  clear: () => void;
}

export function useGeolocation(): UseGeolocation {
  const [state, setState] = useState<GeolocationState>({ status: "idle" });
  // Guards against a late callback from a request the user already cleared.
  const requestId = useRef(0);

  const resolvePosition = useCallback((maximumAge: number): Promise<GeolocationState> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      const unavailable: GeolocationState = { status: "unavailable" };
      setState(unavailable);
      return Promise.resolve(unavailable);
    }

    const id = ++requestId.current;
    setState({ status: "requesting" });

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (id !== requestId.current) {
            resolve({ status: "unavailable" });
            return;
          }
          const granted: GeolocationState = {
            status: "granted",
            point: { lat: position.coords.latitude, lng: position.coords.longitude },
            accuracyMeters: Number.isFinite(position.coords.accuracy)
              ? position.coords.accuracy
              : null,
          };
          setState(granted);
          resolve(granted);
        },
        (error) => {
          if (id !== requestId.current) {
            resolve({ status: "unavailable" });
            return;
          }
          const failure: GeolocationState = error.code === error.PERMISSION_DENIED
            ? { status: "denied" }
            : error.code === error.TIMEOUT
              ? { status: "timeout" }
              : { status: "unavailable" };
          setState(failure);
          resolve(failure);
        },
        { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge },
      );
    });
  }, []);

  const request = useCallback(() => {
    void resolvePosition(300_000);
  }, [resolvePosition]);

  const requestFresh = useCallback(
    () => resolvePosition(0),
    [resolvePosition],
  );

  const clear = useCallback(() => {
    // Invalidate any in-flight request so its result cannot revive the anchor.
    requestId.current += 1;
    setState({ status: "idle" });
  }, []);

  return { state, request, requestFresh, clear };
}

/** User-facing explanation for each failure. */
export function geolocationMessage(state: GeolocationState): string | null {
  switch (state.status) {
    case "denied":
      return "Location access was declined. You can pick an area or place a pin instead.";
    case "unavailable":
      return "Your device couldn't provide a location. Try picking an area instead.";
    case "timeout":
      return "Finding your location took too long. Try again, or pick an area.";
    default:
      return null;
  }
}

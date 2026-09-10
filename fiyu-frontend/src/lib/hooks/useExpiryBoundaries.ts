"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keep time-sensitive UI aligned to the nearest absolute expiry boundary.
 *
 * Browsers may delay timers while a tab is hidden, so visibility restoration
 * always reconciles against the current clock before scheduling the next one.
 */
export function useExpiryBoundaries(
  expirations: readonly number[],
  onBoundary?: () => void,
): number {
  const [now, setNow] = useState(0);
  const onBoundaryRef = useRef(onBoundary);
  useEffect(() => {
    onBoundaryRef.current = onBoundary;
  }, [onBoundary]);
  const expirationKey = expirations
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
    .join(",");

  useEffect(() => {
    const values = expirationKey
      ? expirationKey.split(",").map(Number).filter(Number.isFinite)
      : [];
    let timeout: number | null = null;

    const reconcile = (notify = false) => {
      const current = Date.now();
      setNow(current);
      if (notify) onBoundaryRef.current?.();
      if (timeout !== null) window.clearTimeout(timeout);
      const next = values.find((expiration) => expiration > current);
      if (next !== undefined) {
        timeout = window.setTimeout(() => reconcile(true), Math.max(0, next - current));
      } else {
        timeout = null;
      }
    };
    const reconcileWhenVisible = () => {
      if (document.visibilityState === "visible") reconcile(true);
    };

    reconcile();
    document.addEventListener("visibilitychange", reconcileWhenVisible);
    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", reconcileWhenVisible);
    };
  }, [expirationKey]);

  return now;
}

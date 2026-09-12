"use client";

import { useEffect, useRef, useState } from "react";

function nextLabelBoundary(expiry: number, now: number): number | null {
  const remaining = expiry - now;
  if (remaining <= 0) return null;
  const unit = remaining > 86_400_000
    ? 86_400_000
    : remaining > 3_600_000 ? 3_600_000 : 60_000;
  const displayedUnits = Math.ceil(remaining / unit);
  const boundary = expiry - (displayedUnits - 1) * unit;
  return boundary > now ? boundary : Math.min(expiry, now + unit);
}

/**
 * Advance Together countdowns only when their rendered label changes. Expiry
 * triggers server revalidation; focus/visibility reconciliation handles
 * background-tab timer throttling without network polling.
 */
export function useTogetherLifecycleClock(
  expirations: readonly number[],
  onExpiry?: () => void,
): number {
  const [now, setNow] = useState(() => Date.now());
  const onExpiryRef = useRef(onExpiry);
  useEffect(() => { onExpiryRef.current = onExpiry; }, [onExpiry]);
  const key = expirations.filter(Number.isFinite).sort((a, b) => a - b).join(",");

  useEffect(() => {
    const values = key ? key.split(",").map(Number).filter(Number.isFinite) : [];
    let timeout: number | null = null;
    let previous = Date.now();

    const reconcile = (revalidate = false) => {
      const current = Date.now();
      const crossedExpiry = values.some((expiry) => expiry > previous && expiry <= current);
      previous = current;
      setNow(current);
      if (revalidate || crossedExpiry) onExpiryRef.current?.();
      if (timeout !== null) window.clearTimeout(timeout);
      const next = values
        .map((expiry) => nextLabelBoundary(expiry, current))
        .filter((boundary): boundary is number => boundary !== null)
        .sort((a, b) => a - b)[0];
      timeout = next === undefined
        ? null
        : window.setTimeout(() => reconcile(false), Math.max(1, next - current));
    };
    const reconcileVisible = () => {
      if (document.visibilityState === "visible") reconcile(true);
    };
    const reconcileFocus = () => reconcile(true);

    reconcile(false);
    document.addEventListener("visibilitychange", reconcileVisible);
    window.addEventListener("focus", reconcileFocus);
    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", reconcileVisible);
      window.removeEventListener("focus", reconcileFocus);
    };
  }, [key]);

  return now;
}

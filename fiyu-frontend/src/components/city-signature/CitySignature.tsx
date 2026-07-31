"use client";

import type { ReactNode } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";

import type { CityId } from "@/lib/city/editions";
import { citySignatureFor, type CityEmptyStateKind } from "@/lib/city/signatures";
import { cn } from "@/lib/utils/cn";

export function CityHeaderMark({ cityId, className }: { cityId: CityId; className?: string }) {
  const Mark = citySignatureFor(cityId)?.headerMark;
  if (!Mark) return null;
  return (
    <Mark
      data-city-signature-mark={cityId}
      aria-hidden="true"
      className={cn("size-[1.0625rem] shrink-0 text-lavender-700", className)}
    />
  );
}

/**
 * Each frame holds this long before crossfading to the next.
 *
 * Five frames at 600ms is the three-second discovery window in
 * `DailyPicksPanel`; the two are meant to stay in step.
 */
const ILLUSTRATION_HOLD_MS = 600;

/**
 * The single frame reduced-motion users see: the noodle bowl, which reads as a
 * bowl at a glance without any motion to explain it.
 */
const STATIC_ILLUSTRATION_INDEX = 1;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * The motion preference read as an external store rather than as effect state.
 *
 * The server has no media queries, so the server snapshot is always false and
 * the first client render matches it; React then re-renders with the real value
 * after hydration. Capturing the MediaQueryList inside `subscribe` matters --
 * `matchMedia` hands back a new object each call, so cleaning up against a
 * second lookup would leave the listener attached.
 */
function subscribeMotionPreference(listener: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION_QUERY);
  if (!query) return () => {};
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

const motionPreferenceSnapshot = () =>
  window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
const motionPreferenceServerSnapshot = () => false;

export function CityLoadingSequence({ cityId, className }: { cityId: CityId; className?: string }) {
  const illustrations = citySignatureFor(cityId)?.loadingIllustrations ?? [];
  // Depend on the count, not the array: the signature lookup returns a fresh
  // reference each render and would otherwise restart the sequence constantly.
  const count = illustrations.length;
  const reducedMotion = useSyncExternalStore(
    subscribeMotionPreference,
    motionPreferenceSnapshot,
    motionPreferenceServerSnapshot,
  );
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (reducedMotion || count < 2) return;
    // The set plays once and holds on the last frame rather than looping. The
    // discovery window is timed to end on the mochi, and a wrap would flash the
    // oden again just as the loading state fades out.
    let shown = 0;
    const timer = window.setInterval(() => {
      shown += 1;
      setFrame(shown);
      if (shown >= count - 1) window.clearInterval(timer);
    }, ILLUSTRATION_HOLD_MS);
    return () => window.clearInterval(timer);
  }, [count, reducedMotion]);

  if (count === 0) return null;

  const activeIndex = reducedMotion ? Math.min(STATIC_ILLUSTRATION_INDEX, count - 1) : frame;

  return (
    <div
      aria-hidden="true"
      data-testid="city-loading-sequence"
      data-active-illustration={activeIndex}
      className={cn("relative h-24 w-30", className)}
    >
      {illustrations.map((Illustration, index) => (
        <Illustration
          key={index}
          data-loading-illustration={index}
          className={cn(
            "absolute inset-0 size-full transition-opacity duration-300 ease-(--ease-fiyu)",
            index === activeIndex ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
    </div>
  );
}

export function CityPicksWatermark({ cityId, className }: { cityId: CityId; className?: string }) {
  const Watermark = citySignatureFor(cityId)?.picksWatermark;
  if (!Watermark) return null;
  return (
    <Watermark
      aria-hidden="true"
      data-city-picks-watermark={cityId}
      className={cn("pointer-events-none", className)}
    />
  );
}

export function CityEmptyState({
  cityId,
  kind,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  cityId: CityId;
  kind: CityEmptyStateKind;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const Illustration = citySignatureFor(cityId)?.emptyStateIllustrations?.[kind];

  return (
    <div
      data-city-empty-state={kind}
      className={cn(
        "rounded-card border border-line bg-lavender-50/25 text-center",
        compact ? "mt-3 px-4 py-4" : "px-5 py-6 sm:px-7",
        className,
      )}
    >
      {Illustration && (
        <Illustration
          aria-hidden="true"
          className={cn("mx-auto text-plum", compact ? "h-18 w-24" : "h-24 w-32")}
        />
      )}
      <p className={cn("font-display text-ink", compact ? "mt-1 text-lg" : "mt-2 text-xl")}>
        {title}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-ink-muted">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

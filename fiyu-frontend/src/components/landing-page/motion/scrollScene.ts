"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Motion primitives for the landing page.
 *
 * Two hooks, and no scroll position in either of them.
 *
 * Everything that once read scroll position is gone: the pinned runways, the
 * progress arithmetic, and finally the observer that decided which product step
 * was active. Each was correct in isolation and wrong in a browser, for the same
 * underlying reason -- a section only a viewport or two tall cannot carry a
 * multi-state story at wheel speed. What is left is:
 *
 *   `useEntered`   one-shot reveal, released when enough of the target is
 *                  genuinely visible. Latches: content does not un-arrive
 *                  because a reader scrolled back up.
 *
 * Active states are now plain React state driven by clicks, held in the section
 * that owns them. There is no primitive for it because there is nothing to
 * abstract: it is `useState`.
 */

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * The motion preference as an external store.
 *
 * The server has no media queries, so the server snapshot is false and the first
 * client render matches it; React re-reads after hydration. The MediaQueryList is
 * captured inside `subscribe` because `matchMedia` returns a new object on every
 * call, and cleaning up against a second lookup would leave the listener
 * attached.
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

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotionPreference,
    motionPreferenceSnapshot,
    motionPreferenceServerSnapshot,
  );
}

export interface EnteredOptions {
  /**
   * Shrinks the viewport the observer measures against. Useful for holding a
   * reveal back until a target has cleared the very bottom of the screen.
   */
  rootMargin?: string;
  /**
   * How much of the target must be inside that viewport, as a fraction of the
   * target's own area.
   *
   * This is the option that matters, and its absence was a real bug. With
   * threshold 0 an observer fires when a single pixel of the target touches the
   * root -- so a section eight hundred pixels tall began its entrance while only
   * its top edge had appeared, and by the time the sequence finished a second
   * later the reader had scrolled the animated content past the fold. It looked
   * like the animation had not run. It had; it ran off screen.
   *
   * Expressed against the target rather than the viewport, it also scales by
   * itself: 0.25 means "a quarter of this section has arrived" whether the
   * section is 700px on a desktop or 1100px on a phone.
   */
  threshold?: number;
}

/**
 * Latch true once enough of an element is on screen.
 *
 * Entrance motion only: the element is already fully rendered and readable, so
 * this flips the `data-in` attribute that CSS animates from. It latches on
 * purpose -- a reveal that undoes itself on the way back up makes a page feel
 * like it is assembling and disassembling around the reader.
 *
 * Reduced motion reports true immediately, because the pre-state it would
 * release is not applied under that preference in the first place. Without
 * IntersectionObserver it enters on the next frame rather than never.
 */
export function useEntered<T extends Element>(
  { rootMargin = "0px 0px -15% 0px", threshold = 0 }: EnteredOptions = {},
): { ref: React.RefObject<T | null>; entered: boolean } {
  const ref = useRef<T>(null);
  const reduced = usePrefersReducedMotion();
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (entered || reduced) return;

    // Scheduling rather than setting synchronously keeps this out of the render
    // cascade, and matches how the observer path reports.
    if (typeof IntersectionObserver === "undefined") {
      const handle = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(handle);
    }
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // `isIntersecting` alone is not enough: it is true the moment the target
        // crosses the root at all, whatever the threshold. The ratio is what
        // answers "has enough of this arrived yet".
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= threshold)) {
          setEntered(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [entered, reduced, rootMargin, threshold]);

  return { ref, entered: entered || reduced };
}

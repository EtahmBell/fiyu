"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Motion primitives for the landing page.
 *
 * There is no scroll-position arithmetic left in this file, and that is the
 * headline. Earlier versions computed a 0-to-1 progress value across a tall
 * sticky runway and drove transforms from it. The maths was correct and tested,
 * and the result was still wrong in a browser twice over -- because a
 * viewport-tall sticky box holding shorter content has leftover space at its top
 * and bottom, and that space is exactly what fills the screen while the box
 * arrives and leaves. Tuning the timing inside the box could never fix the shape
 * of the box.
 *
 * So every section is now driven by position or by intent, never by progress:
 *
 *   `useEntered`     one-shot reveal. Settles and stays. Never reverses, because
 *                    content should not vanish when a reader scrolls back up.
 *   `useActiveStep`  which of several blocks is crossing the middle of the
 *                    viewport. Naturally symmetric -- scrolling down advances,
 *                    scrolling up retreats -- because it reports a position, not
 *                    a history. `select` scrolls a block to the middle, so a
 *                    click and a scroll cannot disagree: they are the same fact.
 *
 * Both are IntersectionObserver. Nothing listens to `scroll`.
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

/**
 * Latch true once an element has approached the viewport.
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
  rootMargin = "0px 0px -15% 0px",
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
        if (entries.some((entry) => entry.isIntersecting)) {
          setEntered(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [entered, reduced, rootMargin]);

  return { ref, entered: entered || reduced };
}

/**
 * Which of several blocks is crossing the middle of the viewport.
 *
 * A zero-height root band across the viewport: the block intersecting that line
 * is the active one. Three consequences, all of them the point.
 *
 * It is reversible for free. The answer depends only on where the page is, so
 * scrolling down gives 0, 1, 2 and scrolling back up gives 2, 1, 0 with the same
 * thresholds in the same places. There is no direction to detect and no state
 * machine to run backwards.
 *
 * It is discrete. These are conceptual states, not a continuum, so nothing is
 * ever half-way between two of them.
 *
 * And `select` is honest about the trade it makes. Scrolling the requested block
 * onto the line would keep click and scroll provably identical, but it also lands
 * the selected row near the foot of the screen, which frames the composition
 * badly. With `scrollOnSelect: false` a click just sets the state and the page
 * stays put -- a product-demo tab rather than a jump -- and the next scroll that
 * crosses a boundary restores the position-derived answer. For a caller whose
 * composition is taller than a viewport, `scrollOnSelect: true` brings the block
 * to the line instead.
 *
 * When nothing is crossing the line -- the section is above or below the fold --
 * the last answer stands. That is deliberate: a reader who scrolls past should
 * find the section as they left it.
 */
export function useActiveStep(
  count: number,
  {
    /**
     * Whether scroll position drives the state at all.
     *
     * False on a phone. There, the three states are a tab strip: the columns
     * have stacked, so the surface and the copy are no longer side by side, and
     * a step that changes because the page moved reads as the section losing
     * track of itself. Taps are the only input, and the observer is never
     * created rather than created and ignored.
     */
    observe = true,
    /**
     * Whether a click should move the document. False for a composition that
     * already fits one screen, where moving it can only make the framing worse.
     */
    scrollOnSelect = true,
    rootMargin: rootMarginOption,
  }: { observe?: boolean; scrollOnSelect?: boolean; rootMargin?: string } = {},
  /**
   * A zero-height line, placed low on purpose.
   *
   * At the viewport centre this would work on a desktop, where the surface and
   * the step blocks are separate columns, and fail on a phone, where the surface
   * is sticky above the blocks and covers the middle of the screen: the "active"
   * block would be the one hidden behind it. At 78% the line always sits below
   * the panel, and the block that owns it has just arrived from the bottom --
   * which is the one a reader is about to read.
   *
   * Zero height matters too: exactly one block can cross a line, so there is no
   * boundary case where two report at once and the answer depends on entry order.
   */
): {
  register: (index: number) => (node: HTMLElement | null) => void;
  active: number;
  select: (index: number) => void;
} {
  const rootMargin = rootMarginOption ?? "-78% 0px -22% 0px";
  const nodes = useRef<(HTMLElement | null)[]>([]);
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);

  const register = useCallback(
    (index: number) => (node: HTMLElement | null) => {
      nodes.current[index] = node;
    },
    [],
  );

  useEffect(() => {
    if (!observe || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = nodes.current.indexOf(entry.target as HTMLElement);
          if (index >= 0) setActive(index);
        }
      },
      { rootMargin, threshold: 0 },
    );
    for (const node of nodes.current) if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [count, observe, rootMargin]);

  const select = useCallback(
    (index: number) => {
      setActive(index);
      if (!scrollOnSelect) return;
      nodes.current[index]?.scrollIntoView({
        block: "center",
        behavior: reduced ? "auto" : "smooth",
      });
    },
    [reduced, scrollOnSelect],
  );

  return { register, active, select };
}

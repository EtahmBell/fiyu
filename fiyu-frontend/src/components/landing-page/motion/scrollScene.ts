"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Scroll and entrance primitives for the landing page.
 *
 * There is exactly one way to scrub a section here, and it is a pinned stage
 * with a hold at each end. That is a correction, not a preference.
 *
 * The previous version also offered a "through" mode, which mapped 0 to 1 across
 * an element's whole transit of the viewport -- from just below the fold to
 * fully above it. The arithmetic was right and the result was wrong: for a
 * section about as tall as the viewport, progress is already near 0.25 by the
 * time the section is properly on screen, and past 0.7 by the time it has left.
 * Every effect tuned in that space was mid-animation the moment it became
 * readable and finished animating where nobody could see it. That one mistake
 * produced most of what looked like broken choreography.
 *
 * A pinned stage cannot have that problem. Progress is zero while the stage is
 * arriving and one while it is leaving, so both ends of every transition are
 * fully on screen. The holds then give the page the shape it needs:
 *
 *   arrive -> composed start state, held -> transition -> composed end state,
 *   held -> hand off
 *
 * Fast scrolling can skip the transition, which is fine: the two states it skips
 * between are both finished compositions. Reverse scrolling is symmetric because
 * progress is a pure function of position, not of history.
 *
 * Everything else is entrance-triggered instead -- one latching
 * IntersectionObserver flipping a `data-in` attribute that CSS animates from.
 * Only two sections are scrubbed, because only two are about a continuous change.
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

/** `<= 0` rather than `< 0`, so a negative zero never reaches a custom property. */
const clamp01 = (value: number) => (value <= 0 ? 0 : value > 1 ? 1 : value);

/**
 * Raw position of a pinned runway: 0 as its top meets the viewport top, which is
 * the frame the stage pins on, and 1 as its bottom meets the viewport bottom,
 * which is the frame it releases on.
 *
 * `innerHeight` rather than the `svh` the runway is sized in: on a phone with
 * hidden toolbars the visual viewport is taller than `svh`, which compresses the
 * scrub slightly. That is the harmless direction to be wrong in -- the stage
 * still pins, and both holds still land.
 */
export function pinRawProgress(
  rect: { top: number; height: number },
  viewport: number,
): number {
  const runway = rect.height - viewport;
  // A runway shorter than the stage cannot be scrubbed; show it finished.
  return runway <= 0 ? 1 : clamp01(-rect.top / runway);
}

/**
 * Raw position mapped into the transition window.
 *
 * Everything below `holdIn` reports 0 and everything above `1 - holdOut` reports
 * 1, which is what guarantees a composed state at each end of a stage. Exported
 * so the guarantee is testable rather than merely intended.
 */
export function transitionProgress(raw: number, holdIn: number, holdOut: number): number {
  const span = Math.max(0.05, 1 - holdIn - holdOut);
  return clamp01((raw - holdIn) / span);
}

function rawProgress(element: HTMLElement): number {
  return pinRawProgress(element.getBoundingClientRect(), window.innerHeight || 1);
}

interface Scene {
  element: HTMLElement;
  report: (raw: number) => void;
}

const scenes = new Set<Scene>();
let frame = 0;
let listening = false;

function flush() {
  frame = 0;
  // Read every scene, then write every scene: one layout flush for the page,
  // however many stages are registered.
  const readings: [Scene, number][] = [];
  for (const scene of scenes) readings.push([scene, rawProgress(scene.element)]);
  for (const [scene, raw] of readings) scene.report(raw);
}

function schedule() {
  if (frame === 0) frame = requestAnimationFrame(flush);
}

function registerScene(scene: Scene) {
  scenes.add(scene);
  if (!listening) {
    listening = true;
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
  }
  schedule();
  return () => {
    scenes.delete(scene);
    if (scenes.size > 0 || !listening) return;
    listening = false;
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}

export interface PinSceneOptions {
  /**
   * Share of the runway spent holding the composed start state before anything
   * moves, and holding the composed end state after everything has.
   *
   * These are the point of the hook. Without them a stage begins changing on the
   * frame it pins and stops on the frame it releases, so a reader never sees
   * either endpoint at rest -- which reads as being caught mid-animation even
   * though nothing is actually broken.
   */
  holdIn?: number;
  holdOut?: number;
  /**
   * Viewport height, in CSS pixels, below which this stage does not pin at all.
   *
   * Matched to the `min-height: 640px` query in `landing.css`, which collapses
   * the runway and un-sticks the stage. Both have to agree: if the CSS stops
   * pinning while this keeps scrubbing, a whole sequence gets compressed into
   * whatever few pixels the runway has left over, which is worse than not
   * animating at all.
   */
  minHeight?: number;
  /**
   * Thresholds in *transition* space, measured against the value written to
   * `--scene-progress` rather than against raw scroll. Crossing one advances
   * `step`, which is the only part of a scene that reaches React.
   */
  steps?: readonly number[];
}

/**
 * Scrub a pinned stage.
 *
 * Put `ref` on the tall runway and make its only child `sticky top-0 h-svh`.
 * `--scene-progress` is written on the runway already remapped to 0 to 1 across
 * the transition window, so `landing.css` and every `--from`/`--span` pair work
 * in one space and the holds cannot drift out of step with them.
 *
 * Under reduced motion nothing is registered and nothing is written: the CSS
 * default of `--scene-progress: 1` leaves the stage in its finished state and
 * `step` reports the last one, so every composition and all of the copy is
 * present at rest.
 */
export function usePinScene<T extends HTMLElement>({
  holdIn = 0.16,
  holdOut = 0.22,
  minHeight = 640,
  steps = [],
}: PinSceneOptions = {}): { ref: React.RefObject<T | null>; step: number } {
  const ref = useRef<T>(null);
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Nothing is registered and nothing is written under reduced motion; the
    // returned step is derived below instead, so no state is set here.
    if (reduced) {
      element.style.removeProperty("--scene-progress");
      return;
    }

    let lastStep = -1;
    const unregister = registerScene({
      element,
      report: (raw) => {
        // Not pinned means not scrubbed: show the finished composition rather
        // than racing the whole sequence through a short runway.
        const progress =
          window.innerHeight < minHeight ? 1 : transitionProgress(raw, holdIn, holdOut);
        element.style.setProperty("--scene-progress", progress.toFixed(4));
        let next = 0;
        while (next < steps.length && progress >= steps[next]) next += 1;
        if (next !== lastStep) {
          lastStep = next;
          setStep(next);
        }
      },
    });

    return () => {
      unregister();
      element.style.removeProperty("--scene-progress");
    };
    // `steps` is a module-level literal at every call site, so its identity is
    // stable; joining it keeps the dependency honest without a memo.
  }, [holdIn, holdOut, minHeight, reduced, steps.length, steps.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ref, step: reduced ? steps.length : step };
}

/**
 * Latch true once an element has approached the viewport.
 *
 * Entrance motion only: the element is already fully rendered and readable, so
 * this flips the `data-in` attribute that CSS uses to play the animation.
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

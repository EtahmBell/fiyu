"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Scroll and entrance primitives for the landing page.
 *
 * Two deliberate constraints shape everything here.
 *
 * React never re-renders per frame. Scroll-linked sections write one custom
 * property, `--scene-progress`, onto their own root element; `landing.css`
 * derives every transform from it in `calc()`. Discrete state -- which of three
 * steps is current, whether a block has entered -- is the only thing that
 * reaches React, and it changes a handful of times per section.
 *
 * All measurement shares one requestAnimationFrame. Every registered scene is
 * read in a single pass and written in a single pass, so a page with four
 * scroll-linked sections still costs one layout flush per frame, and the
 * listeners detach entirely as soon as the last scene unmounts.
 */

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * The motion preference as an external store.
 *
 * The server has no media queries, so the server snapshot is false and the
 * first client render matches it; React re-reads after hydration. The
 * MediaQueryList is captured inside `subscribe` because `matchMedia` returns a
 * new object on every call, and cleaning up against a second lookup would leave
 * the listener attached.
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
 * How a scene's runway maps onto scroll position.
 *
 * `sticky`  the scene is a tall runway holding a viewport-height sticky stage.
 *           0 as the runway's top meets the viewport top, 1 once its bottom
 *           meets the viewport bottom -- the span the stage stays pinned for.
 * `through` the scene is a normal block passing the viewport. 0 as its top
 *           enters from below, 1 once its bottom has left the top.
 */
export type SceneMode = "sticky" | "through";

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

function progressOf(element: HTMLElement, mode: SceneMode): number {
  const rect = element.getBoundingClientRect();
  const viewport = window.innerHeight || 1;
  if (mode === "sticky") {
    const runway = rect.height - viewport;
    // A runway shorter than the stage cannot be scrubbed; show it settled.
    return runway <= 0 ? 1 : clamp01(-rect.top / runway);
  }
  return clamp01((viewport - rect.top) / (viewport + rect.height));
}

interface Scene {
  element: HTMLElement;
  mode: SceneMode;
  report: (progress: number) => void;
}

const scenes = new Set<Scene>();
let frame = 0;
let listening = false;

function flush() {
  frame = 0;
  // Read every scene first, then write: one layout flush for the whole page.
  const readings: [Scene, number][] = [];
  for (const scene of scenes) readings.push([scene, progressOf(scene.element, scene.mode)]);
  for (const [scene, progress] of readings) scene.report(progress);
}

function schedule() {
  if (frame === 0) frame = requestAnimationFrame(flush);
}

function startListening() {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
}

function stopListening() {
  if (!listening) return;
  listening = false;
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", schedule);
  if (frame !== 0) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

function registerScene(scene: Scene) {
  scenes.add(scene);
  startListening();
  schedule();
  return () => {
    scenes.delete(scene);
    if (scenes.size === 0) stopListening();
  };
}

export interface SceneOptions {
  mode?: SceneMode;
  /**
   * Progress thresholds. Crossing one moves `step` on, which is the only part
   * of a scene that reaches React -- used for copy that changes rather than
   * moves. Omit for scenes that are purely geometric.
   */
  steps?: readonly number[];
}

/**
 * Scrub a section against scroll.
 *
 * Returns the ref to put on the runway element and the current discrete step.
 * Under reduced motion nothing is registered and nothing is written: the CSS
 * default of `--scene-progress: 1` leaves the scene in its settled state and
 * `step` reports the last one, so all of the copy is present and readable.
 */
export function useScrollScene<T extends HTMLElement>({
  mode = "sticky",
  steps = [],
}: SceneOptions = {}): { ref: React.RefObject<T | null>; step: number } {
  const ref = useRef<T>(null);
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Nothing is registered and nothing is written under reduced motion. The
    // returned step is derived below instead, so no state is set here.
    if (reduced) {
      element.style.removeProperty("--scene-progress");
      return;
    }

    let lastStep = -1;
    const unregister = registerScene({
      element,
      mode,
      report: (progress) => {
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
  }, [mode, reduced, steps.length, steps.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

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
  rootMargin = "0px 0px -12% 0px",
): { ref: React.RefObject<T | null>; entered: boolean } {
  const ref = useRef<T>(null);
  const reduced = usePrefersReducedMotion();
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (entered || reduced) return;

    // Without IntersectionObserver, enter on the next frame rather than never.
    // Scheduling rather than setting synchronously keeps this out of the render
    // cascade, and matches how the observer path reports.
    if (typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(frame);
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

  // Reduced motion is folded in on the way out rather than stored: the CSS
  // pre-state does not apply at all under that preference, so `entered` only
  // ever needs to be true.
  return { ref, entered: entered || reduced };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PickRevealPhase =
  | "idle"
  | "pressing"
  | "shining"
  | "ready"
  | "revealing"
  | "revealed";

export const PICK_REVEAL_START_MS = 180;
export const PICK_REVEAL_CROSSFADE_MS = 360;
export const PICK_REVEAL_REDUCED_MS = 150;

interface PickRevealTransitionOptions {
  ready: boolean;
  pending: boolean;
  reducedMotion: boolean;
  debugLabel?: string;
}

/**
 * Shared visual state machine for a Fiyu Pick reveal.
 *
 * `ready` deliberately remains feature-owned: Daily Picks pass persisted
 * reveal truth, while Personalized Picks pass the canonical selected result.
 */
export function usePickRevealTransition({
  ready,
  pending,
  reducedMotion,
  debugLabel,
}: PickRevealTransitionOptions) {
  const [phase, setPhase] = useState<PickRevealPhase>(ready ? "revealed" : "idle");
  const [run, setRun] = useState(0);
  const [minimumDelayReady, setMinimumDelayReady] = useState(ready);
  const phaseRef = useRef(phase);
  const startedAt = useRef<number | null>(null);
  const requestObserved = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const start = useCallback(() => {
    if (phaseRef.current !== "idle") return false;
    phaseRef.current = "pressing";
    startedAt.current = performance.now();
    setMinimumDelayReady(false);
    setRun((value) => value + 1);
    setPhase("pressing");
    return true;
  }, []);

  const begin = useCallback(() => pending ? false : start(), [pending, start]);

  useEffect(() => {
    if (!pending || phaseRef.current !== "idle") return;
    let active = true;
    queueMicrotask(() => {
      if (active) start();
    });
    return () => { active = false; };
  }, [pending, start]);

  useEffect(() => {
    if (phase !== "pressing") return;
    const frame = window.requestAnimationFrame(() => setPhase("shining"));
    return () => window.cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (run === 0) return;
    const timer = window.setTimeout(() => setMinimumDelayReady(true), PICK_REVEAL_START_MS);
    return () => window.clearTimeout(timer);
  }, [run]);

  useEffect(() => {
    if (phase !== "shining" || !minimumDelayReady || !ready) return;
    const frame = window.requestAnimationFrame(() => setPhase("ready"));
    return () => window.cancelAnimationFrame(frame);
  }, [minimumDelayReady, phase, ready]);

  useEffect(() => {
    if (phase !== "ready") return;
    const frame = window.requestAnimationFrame(() => setPhase("revealing"));
    return () => window.cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase !== "revealing") return;
    const timer = window.setTimeout(
      () => setPhase("revealed"),
      reducedMotion ? PICK_REVEAL_REDUCED_MS : PICK_REVEAL_CROSSFADE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase, reducedMotion]);

  useEffect(() => {
    if (pending) requestObserved.current = true;
    else if (requestObserved.current && !ready && phase !== "idle") {
      requestObserved.current = false;
      phaseRef.current = "idle";
      startedAt.current = null;
      setMinimumDelayReady(false);
      setPhase("idle");
    }
  }, [pending, phase, ready]);

  useEffect(() => {
    if (ready && phase === "idle" && startedAt.current === null) {
      phaseRef.current = "revealed";
      setPhase("revealed");
    }
  }, [phase, ready]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !debugLabel) return;
    console.debug(`[Pick reveal: ${debugLabel}]`, {
      phase,
      elapsedMs: startedAt.current === null
        ? null
        : Math.round(performance.now() - startedAt.current),
      resultReady: ready,
      reducedMotion,
    });
  }, [debugLabel, phase, ready, reducedMotion]);

  return {
    begin,
    phase,
    active: !["idle", "revealed"].includes(phase),
    visuallyRevealed: phase === "revealing" || phase === "revealed",
  };
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { RestaurantPhoto } from "@/components/restaurant/RestaurantPhoto";
import { ScoreMark } from "@/components/ui/ScoreMark";
import type { PersonalizedPickState } from "@/lib/api/schemas";
import { resolveNames } from "@/lib/format/language";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { restaurantMetadataParts } from "@/lib/restaurant/displayArea";
import { cn } from "@/lib/utils/cn";
import styles from "./PersonalizedPickModal.module.css";

interface PersonalizedPickModalProps {
  state: PersonalizedPickState;
  reveal: boolean;
  pendingPosition: number | null;
  onDismiss(): void;
  onSelect(position: number): void;
  onCloseReveal(): void;
}

type RevealPhase = "idle" | "pressing" | "shining" | "ready" | "revealing" | "revealed";

const FOCUSABLE = "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";
const REVEAL_START_MS = 180;
const REVEAL_CROSSFADE_MS = 360;
const REDUCED_CROSSFADE_MS = 150;

export function PersonalizedPickModal({
  state,
  reveal,
  pendingPosition,
  onDismiss,
  onSelect,
  onCloseReveal,
}: PersonalizedPickModalProps) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const dialogRef = useRef<HTMLDivElement>(null);
  const revealCloseRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const selectionRef = useRef<number | null>(null);
  const selectionStartedAt = useRef<number | null>(null);
  const requestObserved = useRef(false);
  const restoreRevealFocus = useRef(false);
  const closeRef = useRef<() => void>(() => undefined);
  const [selectionPosition, setSelectionPosition] = useState<number | null>(null);
  const selected = reveal ? state.selected_restaurant : null;
  const [minimumRevealReady, setMinimumRevealReady] = useState(
    reveal && state.selected_restaurant !== null,
  );
  const [phase, setPhase] = useState<RevealPhase>(
    reveal && state.selected_restaurant !== null ? "revealed" : "idle",
  );
  const selectionLocked = pendingPosition !== null || !["idle", "revealed"].includes(phase);
  const visuallyRevealing = phase === "revealing" || phase === "revealed";

  const close = useCallback(() => {
    if (selectionLocked) return;
    if (selected) onCloseReveal();
    else onDismiss();
  }, [onCloseReveal, onDismiss, selected, selectionLocked]);

  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  const beginSelection = useCallback((position: number, keyboard: boolean) => {
    if (selectionRef.current !== null || pendingPosition !== null) return;
    selectionRef.current = position;
    selectionStartedAt.current = performance.now();
    restoreRevealFocus.current = keyboard;
    setSelectionPosition(position);
    setPhase("pressing");
    setMinimumRevealReady(false);
    onSelect(position);
  }, [onSelect, pendingPosition]);

  useEffect(() => {
    if (phase !== "pressing") return;
    const frame = window.requestAnimationFrame(() => setPhase("shining"));
    return () => window.cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (selectionPosition === null) return;
    const timer = window.setTimeout(() => setMinimumRevealReady(true), REVEAL_START_MS);
    return () => window.clearTimeout(timer);
  }, [selectionPosition]);

  useEffect(() => {
    if (phase !== "shining" || !minimumRevealReady || !selected) return;
    const frame = window.requestAnimationFrame(() => setPhase("ready"));
    return () => window.cancelAnimationFrame(frame);
  }, [minimumRevealReady, phase, selected]);

  useEffect(() => {
    if (phase !== "ready") return;
    const frame = window.requestAnimationFrame(() => setPhase("revealing"));
    return () => window.cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase !== "revealing") return;
    const timer = window.setTimeout(
      () => setPhase("revealed"),
      reducedMotion ? REDUCED_CROSSFADE_MS : REVEAL_CROSSFADE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase, reducedMotion]);

  useEffect(() => {
    if (pendingPosition !== null) requestObserved.current = true;
    else if (requestObserved.current && !selected && phase !== "idle") {
      requestObserved.current = false;
      selectionRef.current = null;
      selectionStartedAt.current = null;
      setSelectionPosition(null);
      setMinimumRevealReady(false);
      setPhase("idle");
    }
  }, [pendingPosition, phase, selected]);

  useEffect(() => {
    if (phase !== "revealed" || !restoreRevealFocus.current) return;
    restoreRevealFocus.current = false;
    revealCloseRef.current?.focus({ preventScroll: true });
  }, [phase]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const startedAt = selectionStartedAt.current;
    console.debug("[PersonalizedPick reveal]", {
      phase,
      elapsedMs: startedAt === null ? null : Math.round(performance.now() - startedAt),
      backendResultReady: selected !== null,
      hiddenFaceMounted: true,
      restaurantFaceMounted: selected !== null,
      reducedMotion,
    });
  }, [phase, reducedMotion, selected]);

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
        .filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus();
    };
  }, []);

  const names = selected ? resolveNames(selected) : null;
  const metadata = selected
    ? restaurantMetadataParts(selected.category, selected).join(" · ")
    : "";

  return (
    <div
      data-testid="personalized-pick-backdrop"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/45 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={visuallyRevealing
          ? "personalized-pick-reveal-title"
          : "personalized-pick-title"}
        aria-describedby={visuallyRevealing
          ? "personalized-pick-reveal-description"
          : "personalized-pick-description"}
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-[42rem] overflow-y-auto rounded-[1.25rem] border border-paper-line bg-canvas px-5 py-6 shadow-2xl sm:px-9 sm:py-8"
      >
        <div
          className={styles.stage}
          data-pp-phase={phase}
          data-reduced-motion={reducedMotion ? "true" : "false"}
          data-testid="personalized-pick-reveal-stage"
        >
          <div
            className={styles.choiceFace}
            aria-hidden={visuallyRevealing}
            inert={visuallyRevealing}
            data-testid="personalized-pick-hidden-face"
          >
            <button
              type="button"
              aria-label="Close for now"
              disabled={selectionLocked}
              onClick={close}
              className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-full text-xl text-ink-muted hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-personalized"
            >
              <span aria-hidden="true">×</span>
            </button>
            <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-personalized-700 uppercase">
              Personalized Pick
            </p>
            <h2 id="personalized-pick-title" className="mt-2 font-display text-4xl leading-none text-ink">
              Something for you
            </h2>
            <p id="personalized-pick-description" className="mt-3 text-sm leading-6 text-ink-body">
              Fiyu has three places in mind. Pick one.
            </p>
            <div className="mt-7 grid grid-cols-3 gap-3 sm:gap-5" aria-label="Three hidden restaurant cards">
              {[0, 1, 2].map((position) => (
                <button
                  key={position}
                  type="button"
                  aria-label={`Choose hidden card ${position + 1}`}
                  disabled={selectionPosition !== null || pendingPosition !== null}
                  aria-busy={selectionPosition === position && !selected}
                  data-choice-state={selectionPosition === null
                    ? "available"
                    : selectionPosition === position
                      ? "selected"
                      : "withheld"}
                  data-selection-motion={reducedMotion ? "reduced" : "press-shine"}
                  onClick={(event) => beginSelection(position, event.detail === 0)}
                  className={cn(
                    styles.hiddenCard,
                    selectionPosition === position && styles.chosenCard,
                    selectionPosition !== null && selectionPosition !== position && styles.withheldCard,
                    "group aspect-[3/4] min-w-0 rounded-xl border border-personalized-soft bg-lavender-50 shadow-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-personalized disabled:cursor-wait",
                  )}
                >
                  <span aria-hidden="true" className="font-display text-3xl leading-none text-plum sm:text-4xl">
                    Fiyu
                  </span>
                  <span
                    aria-hidden="true"
                    className={styles.cardShine}
                    data-active={selectionPosition === position && phase !== "idle" && phase !== "revealed"}
                    data-testid={selectionPosition === position ? "personalized-pick-shine" : undefined}
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={selectionLocked}
              onClick={close}
              className="mx-auto mt-6 flex min-h-11 items-center px-4 text-sm font-medium text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-personalized"
            >
              Not now
            </button>
          </div>

          {selected ? (
            <div
              className={styles.restaurantFace}
              aria-hidden={phase !== "revealed"}
              inert={phase !== "revealed"}
              data-testid="personalized-pick-restaurant-face"
            >
              <p className="sr-only" aria-live="polite" aria-atomic="true">
                {phase === "revealed"
                  ? `Your Personalized Pick is ${names?.primary?.text ?? "ready"}.`
                  : ""}
              </p>
              <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-personalized-700 uppercase">
                Your pick
              </p>
              <h2 id="personalized-pick-reveal-title" className="mt-2 font-display text-4xl leading-none text-ink">
                {names?.primary?.text ?? "Your Personalized Pick"}
              </h2>
              <p id="personalized-pick-reveal-description" className="mt-3 text-sm text-ink-muted">
                Picked especially around your taste.
              </p>
              <RestaurantPhoto
                placeId={selected.place_id}
                restaurantName={names?.primary?.text ?? "Selected restaurant"}
                className="mt-6 aspect-[16/9] w-full"
              />
              <div className="mt-5 flex items-start justify-between gap-5 border-t border-personalized-soft pt-5">
                <div>
                  {metadata ? <p className="text-sm leading-6 text-ink-body">{metadata}</p> : null}
                  <p className="mt-2 text-xs font-semibold tracking-[0.12em] text-personalized-700 uppercase">
                    Picked for you
                  </p>
                </div>
                <ScoreMark score={selected.fiyu_score} size="md" tone="personalized" />
              </div>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  ref={revealCloseRef}
                  type="button"
                  onClick={onCloseReveal}
                  className="min-h-11 rounded-lg px-4 text-sm font-medium text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-personalized"
                >
                  Close
                </button>
                <Link
                  href={`/restaurants/${encodeURIComponent(selected.place_id)}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-lavender-600 px-5 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
                >
                  View place
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

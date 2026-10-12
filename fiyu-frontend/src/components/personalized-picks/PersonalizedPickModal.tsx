"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";

import { RestaurantPhoto } from "@/components/restaurant/RestaurantPhoto";
import { ScoreMark } from "@/components/ui/ScoreMark";
import type { PersonalizedPickState } from "@/lib/api/schemas";
import { resolveNames } from "@/lib/format/language";
import { restaurantMetadataParts } from "@/lib/restaurant/displayArea";

interface PersonalizedPickModalProps {
  state: PersonalizedPickState;
  reveal: boolean;
  pendingPosition: number | null;
  onDismiss(): void;
  onSelect(position: number): void;
  onCloseReveal(): void;
}

const FOCUSABLE = "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

export function PersonalizedPickModal({
  state,
  reveal,
  pendingPosition,
  onDismiss,
  onSelect,
  onCloseReveal,
}: PersonalizedPickModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const selected = reveal ? state.selected_restaurant : null;
  const close = useCallback(() => {
    if (selected) onCloseReveal();
    else onDismiss();
  }, [onCloseReveal, onDismiss, selected]);

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
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
  }, [close]);

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
        aria-labelledby="personalized-pick-title"
        aria-describedby="personalized-pick-description"
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-[42rem] overflow-y-auto rounded-[1.25rem] border border-paper-line bg-canvas px-5 py-6 shadow-2xl sm:px-9 sm:py-8"
      >
        {selected ? (
          <div aria-live="polite" aria-atomic="true">
            <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-personalized-700 uppercase">
              Your pick
            </p>
            <h2 id="personalized-pick-title" className="mt-2 font-display text-4xl leading-none text-ink">
              {names?.primary?.text ?? "Your Personalized Pick"}
            </h2>
            <p id="personalized-pick-description" className="mt-3 text-sm text-ink-muted">
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
        ) : (
          <>
            <button
              type="button"
              aria-label="Close for now"
              onClick={onDismiss}
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
                  disabled={pendingPosition !== null}
                  onClick={() => onSelect(position)}
                  className="group aspect-[3/4] min-w-0 rounded-xl border border-personalized-soft bg-surface shadow-paper transition-[transform,border-color] duration-200 ease-(--ease-fiyu) hover:-translate-y-1 hover:border-personalized focus-visible:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-personalized motion-reduce:transform-none motion-reduce:transition-none disabled:cursor-wait disabled:opacity-65"
                >
                  <span aria-hidden="true" className="mx-auto flex size-9 items-center justify-center rounded-full border border-personalized-soft font-display text-xl text-personalized-700 sm:size-11">
                    F
                  </span>
                  <span className="sr-only">
                    {pendingPosition === position ? "Choosing" : `Card ${position + 1}`}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="mx-auto mt-6 flex min-h-11 items-center px-4 text-sm font-medium text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-personalized"
            >
              Not now
            </button>
          </>
        )}
      </div>
    </div>
  );
}

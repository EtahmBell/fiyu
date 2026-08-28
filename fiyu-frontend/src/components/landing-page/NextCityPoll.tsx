"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import { getApiBaseUrl } from "@/lib/config/env";

export const NEXT_CITY_CAMPAIGN_ACTIVE = true;
export const NEXT_CITY_CAMPAIGN_EVENT = "fiyu:open-next-city-vote";
const VOTER_STORAGE_KEY = "fiyu:next-city-voter:v1";

const OPTIONS = [
  ["rome", "Rome"],
  ["hong_kong", "Hong Kong"],
  ["paris", "Paris"],
  ["sydney", "Sydney"],
  ["los_angeles", "Los Angeles"],
  ["other", "Other"],
] as const;

type Choice = (typeof OPTIONS)[number][0];

export function openNextCityVote() {
  window.dispatchEvent(new Event(NEXT_CITY_CAMPAIGN_EVENT));
}

function anonymousVoterId(): string {
  const existing = window.localStorage.getItem(VOTER_STORAGE_KEY);
  if (existing) return existing;
  const generated = window.crypto.randomUUID();
  window.localStorage.setItem(VOTER_STORAGE_KEY, generated);
  return generated;
}

export function NextCityPoll({ modalOnly = false }: { modalOnly?: boolean }) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [otherCity, setOtherCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(NEXT_CITY_CAMPAIGN_EVENT, show);
    return () => window.removeEventListener(NEXT_CITY_CAMPAIGN_EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!choice || submitting) return;
    if (choice === "other" && !otherCity.trim()) {
      setError("Enter a city name.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/city-poll/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voter_id: anonymousVoterId(),
          choice,
          other_city: choice === "other" ? otherCity.trim() : null,
        }),
      });
      if (!response.ok) throw new Error("We couldn’t record your vote. Try again.");
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn’t record your vote.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!NEXT_CITY_CAMPAIGN_ACTIVE) return null;

  return (
    <>
      {!modalOnly && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-8 inline-flex min-h-11 items-center text-sm font-semibold text-plum underline decoration-lavender-200 underline-offset-4 transition-colors hover:text-lavender-700 hover:decoration-lavender-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
        >
          Vote on the next city
        </button>
      )}

      {open && createPortal(
        <div
          data-testid="next-city-vote-backdrop"
          className="fixed inset-0 z-[80] grid h-[100dvh] w-screen place-items-center overflow-hidden bg-ink/20 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
          onPointerDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-md overflow-y-auto overscroll-contain rounded-card border border-line bg-surface px-6 py-7 shadow-xl sm:px-8 sm:py-8"
          >
            <button
              type="button"
              aria-label="Close city vote"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 flex size-11 items-center justify-center text-xl text-ink-muted transition-colors hover:text-ink"
            >
              ×
            </button>

            {submitted ? (
              <div className="py-7 pr-8">
                <p className="text-xs font-semibold tracking-[0.16em] text-lavender-700 uppercase">Vote recorded</p>
                <h2 id={titleId} className="mt-3 font-display text-3xl text-ink">Thank you.</h2>
                <p role="status" className="mt-4 text-sm leading-7 text-ink-muted">
                  Thanks for helping choose where Fiyu goes next.
                </p>
              </div>
            ) : (
              <form onSubmit={submit}>
                <fieldset>
                  <legend id={titleId} className="pr-10 font-display text-3xl text-ink">
                    Where should Fiyu go next?
                  </legend>
                  <div className="mt-6 border-t border-line">
                    {OPTIONS.map(([value, label]) => {
                      const selected = choice === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            setChoice(selected ? null : value);
                            setError(null);
                          }}
                          className="flex min-h-12 w-full items-center justify-between border-b border-line text-left text-sm text-ink transition-colors hover:bg-subtle focus-visible:bg-subtle"
                        >
                          <span>{label}</span>
                          <span aria-hidden="true" className={selected ? "text-lavender-700" : "text-ink-faint"}>
                            {selected ? "Selected" : "○"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {choice === "other" && (
                  <div className="mt-5">
                    <label htmlFor={`${titleId}-other`} className="text-xs font-semibold tracking-[0.12em] text-ink-faint uppercase">
                      City name
                    </label>
                    <input
                      id={`${titleId}-other`}
                      maxLength={80}
                      value={otherCity}
                      onChange={(event) => setOtherCity(event.target.value)}
                      className="mt-2 min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink focus:border-lavender-500"
                    />
                  </div>
                )}

                {error && <p role="alert" className="mt-3 text-sm text-rose-dust">{error}</p>}
                <button
                  type="submit"
                  disabled={!choice || submitting}
                  className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-plum px-5 text-sm font-medium text-white transition-colors hover:bg-lavender-700 disabled:opacity-40"
                >
                  {submitting ? "Sending…" : "Submit vote"}
                </button>
              </form>
            )}
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}

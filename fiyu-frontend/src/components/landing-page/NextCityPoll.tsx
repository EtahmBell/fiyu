"use client";

import { useState } from "react";

import { getApiBaseUrl } from "@/lib/config/env";

const OPTIONS = [
  ["rome", "Rome"],
  ["hong_kong", "Hong Kong"],
  ["paris", "Paris"],
  ["sydney", "Sydney"],
  ["los_angeles", "Los Angeles"],
  ["other", "Other"],
] as const;

type Choice = (typeof OPTIONS)[number][0];

export function NextCityPoll() {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [otherCity, setOtherCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (submitted) {
    return (
      <p role="status" className="mt-8 border-l-2 border-rose-dust pl-4 text-sm text-ink-muted">
        Thanks for helping choose where Fiyu goes next.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-8 inline-flex min-h-11 items-center text-sm font-semibold text-plum underline decoration-lavender-200 underline-offset-4 transition-colors hover:text-lavender-700 hover:decoration-lavender-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
      >
        Vote on the next city
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 border-t border-line pt-6">
      <fieldset>
        <legend className="font-display text-xl text-ink">Where should Fiyu go next?</legend>
        <div className="mt-4 flex flex-wrap gap-2">
          {OPTIONS.map(([value, label]) => (
            <label
              key={value}
              className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3.5 text-sm transition-colors ${
                choice === value
                  ? "border-lavender-500 bg-lavender-50 text-plum"
                  : "border-line bg-surface text-ink-muted hover:border-lavender-200 hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name="next-city"
                value={value}
                checked={choice === value}
                onChange={() => {
                  setChoice(value);
                  setError(null);
                }}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {choice === "other" && (
        <div className="mt-4">
          <label htmlFor="next-city-other" className="text-xs font-semibold tracking-[0.12em] text-ink-faint uppercase">
            City name
          </label>
          <input
            id="next-city-other"
            maxLength={80}
            value={otherCity}
            onChange={(event) => setOtherCity(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink focus:border-lavender-500 sm:text-sm"
          />
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-rose-dust">{error}</p>}
      <button
        type="submit"
        disabled={!choice || submitting}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-plum px-5 text-sm font-medium text-white transition-colors hover:bg-lavender-700 disabled:opacity-40"
      >
        {submitting ? "Sending…" : "Submit vote"}
      </button>
    </form>
  );
}

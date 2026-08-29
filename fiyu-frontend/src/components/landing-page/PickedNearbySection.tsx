"use client";

import { useState } from "react";

import {
  ExampleSelectionRow,
  IllustrativeNote,
} from "@/components/landing-page/ExamplePickCard";
import { LOCATION_SETS } from "@/components/landing-page/fictionalRestaurantExamples";
import {
  LANDING_HEADING,
  LANDING_MEASURE,
  LANDING_RHYTHM,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { useEntered } from "@/components/landing-page/motion/scrollScene";
import { cn } from "@/lib/utils/cn";

/**
 * Picked around where you are.
 *
 * One surface, three starting points, and a control that switches between them.
 * Shinjuku, Shibuya and Ginza rather than Yanaka and Setagaya: a visitor who has
 * never been to Tokyo recognises all three, and recognising the place is what
 * makes the demonstration land in one glance instead of one reading.
 *
 * Each set draws from genuinely adjacent neighbourhoods -- Shinjuku reaches
 * Yotsuya and Okubo, Shibuya reaches Tomigaya and Nakameguro, Ginza reaches
 * Shimbashi and Tsukiji -- so switching visibly moves across the city rather than
 * relabelling the same places. The areas are real; the restaurants are invented.
 *
 * The control is text tabs, not pills. The application's filter chip was the
 * honest reuse but read as app furniture dropped into an editorial page: a
 * lavender underline under tracked micro-caps belongs here, and still gives a
 * 44px target and real button semantics.
 *
 * The copy is careful about one thing: Fiyu uses your location *when the
 * selection is made*. It does not follow you around, and a marketing page should
 * not imply that it does -- so the standing line under the surface says so
 * outright.
 */

function AreaTab({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "relative inline-flex min-h-11 items-center px-1 text-[0.6875rem] font-semibold tracking-[0.18em] uppercase",
        "transition-colors duration-300 ease-(--ease-fiyu)",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-500",
        selected ? "text-lavender-700" : "text-ink-faint hover:text-ink-muted",
      )}
    >
      {label}
      {/* Always rendered, so the row's height never changes as a tab is chosen. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 bottom-2 h-px origin-left transition-transform duration-300 ease-(--ease-fiyu)",
          selected ? "scale-x-100 bg-lavender-500" : "scale-x-0 bg-lavender-500",
        )}
      />
    </button>
  );
}

export function PickedNearbySection() {
  const { ref, entered } = useEntered<HTMLDivElement>();
  const [selected, setSelected] = useState(LOCATION_SETS[0].id);
  const flag = entered ? "true" : "false";
  const set = LOCATION_SETS.find((entry) => entry.id === selected) ?? LOCATION_SETS[0];

  return (
    <section id="picked-nearby" className="scroll-mt-24 border-b border-line bg-canvas">
      <div
        ref={ref}
        className={cn(
          LANDING_MEASURE,
          LANDING_RHYTHM,
          "grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)] lg:items-center",
        )}
      >
        <div className="min-w-0">
          <SectionEyebrow>Local by design</SectionEyebrow>
          <h2 className={cn(LANDING_HEADING, "mt-6 max-w-[16ch] text-ink")}>
            Picked around where you are.
          </h2>
          <p className="mt-7 max-w-[32rem] text-base leading-8 text-ink-muted">
            When you ask for new Picks, Fiyu starts with where you are and surfaces a few nearby
            places worth finding.
          </p>
        </div>

        <div
          className="fiyu-lp-rise min-w-0"
          data-in={flag}
          style={{ "--rise-from": "16px" } as React.CSSProperties}
        >
          <div
            data-testid="location-surface"
            data-location={set.id}
            className="min-w-0"
          >
            <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-ink-faint uppercase">
              Starting from
            </p>
            <div
              role="group"
              aria-label="Starting point"
              className="mt-1 flex min-w-0 flex-wrap items-center gap-x-7 border-b border-line"
            >
              {LOCATION_SETS.map((entry) => (
                <AreaTab
                  key={entry.id}
                  label={entry.area}
                  selected={entry.id === set.id}
                  onSelect={() => setSelected(entry.id)}
                />
              ))}
            </div>

            {/*
             * Keyed on the selection, so switching remounts the rows and replays
             * the shared fade rather than needing a transition per row. The
             * container height is stable: three rows either way.
             */}
            <div
              key={set.id}
              className="mt-1"
              style={{ animation: "fiyu-fade-in 300ms var(--ease-fiyu)" }}
            >
              {set.picks.map((example) => (
                <ExampleSelectionRow key={example.key} example={example} />
              ))}
            </div>
          </div>

          <IllustrativeNote className="mt-6">Illustrative examples</IllustrativeNote>
          <p className="mt-4 max-w-[30rem] text-[0.8125rem] leading-6 text-ink-faint">
            Your location is used at the moment a selection is made. Picks you already have stay
            put as you move.
          </p>
        </div>
      </div>
    </section>
  );
}

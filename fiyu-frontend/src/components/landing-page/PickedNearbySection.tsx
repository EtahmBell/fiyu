"use client";

import { useState } from "react";

import { ExampleSelectionRow } from "@/components/landing-page/ExamplePickCard";
import { LOCATION_SETS } from "@/components/landing-page/landingExamples";
import {
  LANDING_HEADING,
  LANDING_MEASURE,
  LANDING_RHYTHM,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { useEntered } from "@/components/landing-page/motion/scrollScene";
import { Chip } from "@/components/ui/Chip";
import { cn } from "@/lib/utils/cn";

/**
 * Picked around where you are.
 *
 * This replaces "A few for you. Different for someone else." -- three dense
 * tables of names plus a sentence explaining how many of them overlapped. The
 * concept was sound and the execution asked a visitor to do arithmetic, and
 * overlap between hypothetical users was never the behaviour most worth a whole
 * section. Location is.
 *
 * One surface, two starting points, and a control that switches between them.
 * Yanaka and Shibuya are genuinely different parts of the city, so the Picks
 * visibly change rather than being the same places relabelled. A visitor gets the
 * idea from one click, without reading an explanation.
 *
 * The control is the application's own filter chip. This section is about a
 * product behaviour, so it should be operated with the product's own component.
 *
 * The copy is careful about one thing: Fiyu uses your location *when the
 * selection is made*. It does not follow you around, and a marketing page should
 * not imply that it does -- so the standing line under the surface says so
 * outright.
 *
 * No pinned sequence. A click, a short cross-fade, one entrance.
 */
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
            className="min-w-0 rounded-card border border-line bg-surface p-4 sm:p-5"
          >
            <div
              role="group"
              aria-label="Starting point"
              className="flex min-w-0 flex-wrap items-center gap-2"
            >
              <span aria-hidden="true" className="mr-1 text-[0.625rem] font-semibold tracking-[0.16em] text-ink-faint uppercase">
                Starting from
              </span>
              {LOCATION_SETS.map((entry) => (
                <Chip
                  key={entry.id}
                  selected={entry.id === set.id}
                  onClick={() => setSelected(entry.id)}
                >
                  {entry.area}
                </Chip>
              ))}
            </div>

            {/*
             * Keyed on the selection, so switching remounts the rows and replays
             * the shared fade rather than needing a transition per row. The
             * container height is stable: three rows either way.
             */}
            <div
              key={set.id}
              className="mt-4 border-t border-line pt-1"
              style={{ animation: "fiyu-fade-in 300ms var(--ease-fiyu)" }}
            >
              {set.picks.map((example) => (
                <ExampleSelectionRow key={example.id} example={example} />
              ))}
            </div>
          </div>

          <p className="mt-5 max-w-[30rem] text-[0.8125rem] leading-6 text-ink-faint">
            Your location is used at the moment a selection is made. Picks you already have stay
            put as you move.
          </p>
        </div>
      </div>
    </section>
  );
}

"use client";

import { ExampleSelectionRow } from "@/components/landing-page/ExamplePickCard";
import {
  SELECTION_COLUMNS,
  SHARED_SELECTION_ID,
} from "@/components/landing-page/landingExamples";
import {
  LANDING_MEASURE,
  LANDING_RHYTHM,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { useEntered } from "@/components/landing-page/motion/scrollScene";
import { cn } from "@/lib/utils/cn";

/**
 * Different discoveries for different people.
 *
 * Three selections, side by side, and the reader can check the claim by eye:
 * one place appears twice across nine slots and the other seven appear once.
 * The composition is the argument, so the copy stays to two lines and gets out
 * of the way.
 *
 * A different rhythm again -- no cards, no images, no map. Three ruled indexes
 * of type, which is what a broader pool actually looks like when you lay three
 * samples of it next to each other.
 *
 * The columns are labelled by area rather than by person, so nothing here has to
 * invent a user, and the labels travel to any city.
 */
export function DifferentDiscoveries() {
  const { ref, entered } = useEntered<HTMLDivElement>();
  const flag = entered ? "true" : "false";

  return (
    <section id="different-discoveries" className="scroll-mt-24 border-b border-line bg-canvas">
      <div ref={ref} className={cn(LANDING_MEASURE, LANDING_RHYTHM)}>
        <div className="max-w-[52rem]">
          <SectionEyebrow>Spread, not concentrated</SectionEyebrow>
          <h2 className="mt-6 font-display text-[clamp(2.25rem,4.2vw,3.75rem)] leading-[1.02] tracking-[-0.02em]">
            <span className="block text-ink">A few for you.</span>
            <span className="block text-ink-faint">Different for someone else.</span>
          </h2>
          <p className="mt-7 max-w-[36rem] text-base leading-8 text-ink-muted">
            Fiyu spreads attention across a broader pool of excellent restaurants instead of
            sending everyone to the same small set of places.
          </p>
        </div>

        <div className="mt-14 grid gap-x-10 gap-y-12 sm:mt-20 sm:grid-cols-3">
          {SELECTION_COLUMNS.map((column, index) => (
            <div
              key={column.label}
              className="fiyu-lp-rise min-w-0"
              data-in={flag}
              style={
                {
                  "--rise-delay": index * 130 + "ms",
                  "--rise-from": "18px",
                } as React.CSSProperties
              }
            >
              <p className="text-[0.625rem] font-semibold tracking-[0.18em] text-ink-faint uppercase">
                {column.label}
              </p>
              <div className="mt-4">
                {column.picks.map((example) => (
                  <ExampleSelectionRow
                    key={example.id}
                    example={example}
                    shared={example.id === SHARED_SELECTION_ID}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-12 max-w-[32rem] border-t border-line pt-6 text-sm leading-7 text-ink-muted">
          One place appears in two of these three selections. The other seven appear once.
        </p>
      </div>
    </section>
  );
}

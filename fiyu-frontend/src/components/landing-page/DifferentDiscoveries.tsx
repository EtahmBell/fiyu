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
import { SlotImage } from "@/components/landing-page/SlotImage";
import { cn } from "@/lib/utils/cn";

/**
 * Different discoveries for different people.
 *
 * Three selections, side by side, and a reader can check the claim by eye: one
 * place appears twice across nine slots and the other seven appear once.
 *
 * The animation here was never broken -- it was one entrance stagger, and it
 * behaved. What was broken was the imagery it revealed. Each column led with a
 * 4:5 image box, and with no photography yet that box was a large flat tinted
 * panel, so a browser recording showed three empty coloured rectangles arriving
 * first and the restaurant names arriving as the reader scrolled further. That
 * reads as a page still loading, which is worse than no image at all.
 *
 * So this is now the static editorial version. Every selection is present
 * immediately, the imagery is a 56px thumbnail beside each label rather than a
 * panel above it -- small enough that an empty one is a mark and not a void, and
 * still the right slot for a real photograph -- and the only motion is one short
 * stagger as the section arrives. Clarity over choreography.
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
          <p className="mt-7 max-w-[34rem] text-base leading-8 text-ink-muted">
            Fiyu spreads attention across a broader pool of excellent restaurants instead of
            sending everyone to the same small set of places.
          </p>
        </div>

        <div className="mt-12 grid gap-x-10 gap-y-10 sm:mt-16 sm:grid-cols-3 sm:gap-y-0">
          {SELECTION_COLUMNS.map((column, index) => (
            <div
              key={column.label}
              className="fiyu-lp-rise min-w-0"
              data-in={flag}
              style={
                {
                  "--rise-delay": index * 90 + "ms",
                  "--rise-duration": "520ms",
                  "--rise-from": "12px",
                } as React.CSSProperties
              }
            >
              <div className="flex items-center gap-3.5 border-b border-line-strong pb-4">
                {/*
                 * A fixed square, so a real photograph drops in without moving
                 * anything. Decorative: the column is already labelled.
                 */}
                <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-line">
                  <SlotImage slot={column.slot} sizes="56px" />
                </div>
                <p className="min-w-0 text-[0.625rem] font-semibold tracking-[0.18em] text-ink-faint uppercase">
                  {column.label}
                </p>
              </div>
              <div>
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

        <p className="mt-12 max-w-[32rem] border-t border-line pt-6 text-sm leading-7 text-ink-muted sm:mt-14">
          One place appears in two of these three selections. The other seven appear once.
        </p>
      </div>
    </section>
  );
}

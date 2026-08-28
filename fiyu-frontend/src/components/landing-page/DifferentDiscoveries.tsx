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
 * The idea was already right; the execution was dry. Three columns of pure type
 * asked a reader to compare nine names in order to feel something that ought to
 * be immediate. Each column now opens on an image, so the three read as three
 * different evenings before a single name is compared -- and the overlap, when it
 * is noticed, lands as a surprise rather than as a table lookup.
 *
 * The columns are labelled by area rather than by person, so nothing here invents
 * a user and the labels travel to any city. Area names are the ones a person
 * would say out loud; the catalog's chome-level strings stay in the application,
 * where a reader standing on the street actually needs them.
 *
 * Entrance motion only, on a stagger. Nothing in this section is about a
 * continuous change, so nothing here is scrubbed.
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

        <div className="mt-14 grid gap-x-10 gap-y-14 sm:mt-20 sm:grid-cols-3 sm:gap-y-0">
          {SELECTION_COLUMNS.map((column, index) => (
            <div
              key={column.label}
              className="fiyu-lp-rise min-w-0"
              data-in={flag}
              style={
                {
                  "--rise-delay": index * 150 + "ms",
                  "--rise-from": "18px",
                } as React.CSSProperties
              }
            >
              {/*
               * A fixed aspect box, so the layout is identical whether the slot
               * holds a photograph or the type plate that stands in for one.
               */}
              <div className="relative aspect-[16/10] overflow-hidden rounded-card border border-line sm:aspect-[4/5]">
                <SlotImage
                  slot={column.slot}
                  sizes="(max-width: 639px) calc(100vw - 2.5rem), 30vw"
                />
              </div>
              <p className="mt-5 text-[0.625rem] font-semibold tracking-[0.18em] text-ink-faint uppercase">
                {column.label}
              </p>
              <div className="mt-3">
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

        <p className="mt-14 max-w-[32rem] border-t border-line pt-6 text-sm leading-7 text-ink-muted sm:mt-16">
          One place appears in two of these three selections. The other seven appear once.
        </p>
      </div>
    </section>
  );
}

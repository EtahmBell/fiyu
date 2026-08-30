"use client";

import {
  ExamplePickCard,
  IllustrativeNote,
} from "@/components/landing-page/ExamplePickCard";
import { ONLY_A_FEW_EXAMPLES } from "@/components/landing-page/fictionalRestaurantExamples";
import {
  LANDING_MEASURE,
  LANDING_RHYTHM,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { useEntered } from "@/components/landing-page/motion/scrollScene";
import { cn } from "@/lib/utils/cn";

/**
 * Only a few.
 *
 * One discovery arrives, then a second, then a third, and then the page stops
 * giving them out.
 *
 * The scroll runway is gone. It survived three timing passes -- longer holds,
 * redistributed windows, content pushed to both edges of the sticky box -- and a
 * browser recording still showed a reader reaching an empty viewport between the
 * first card and the finished trio. At that point the runway itself is the
 * defect, not its parameters: a 185svh wrapper whose composition is 500px tall is
 * mostly wrapper, and every fix was an attempt to hide that.
 *
 * What is left is the simplest thing that expresses the idea. An ordinary
 * section. The three shelves are ruled from the first paint, so the final layout
 * is reserved before anything appears and nothing shifts. When the section
 * arrives, the cards fade up one after another, 320ms apart. Then they stay.
 *
 * No runway, no sticky, no scroll progress, no holds, no exit. Once a card is
 * there it is there, including on the way back up -- a discovery that un-arrives
 * because a reader scrolled up would undo the whole point of the section.
 *
 * The section is now about 700px instead of 1665px, which is also the honest
 * length for what it says: one, two, three, stop.
 */

/** 300ms apart: three arrivals rather than one staggered animation. */
const ARRIVAL_STEP_MS = 300;

/** A whisper of rake from `sm`, where the cards sit side by side. */
const RAKE = ["sm:rotate-[-0.9deg]", "sm:rotate-[0.6deg]", "sm:rotate-[1.8deg]"] as const;

export function OnlyAFewSection() {
  /*
   * Observed on the card row, not on the section.
   *
   * The section is about 750px tall, so watching *it* fired the sequence as soon
   * as its heading appeared -- and by the time the third card had finished
   * arriving, the cards themselves were still below the fold. A reader scrolled
   * into a composition that had already happened.
   *
   * Watching the card row with a 28% bottom margin fires when the row's top
   * reaches roughly three quarters of the way down the viewport: the heading and
   * the copy are fully readable above it, and the first shelf is just entering, so
   * the one-two-three is perceived rather than merely completed.
   */
  const { ref, entered } = useEntered<HTMLDivElement>({ rootMargin: "0px 0px -28% 0px" });
  const flag = entered ? "true" : "false";

  return (
    <section id="only-a-few" className="scroll-mt-24 border-b border-line bg-lavender-50/50">
      <div className={cn(LANDING_MEASURE, LANDING_RHYTHM)}>
        <div className="mx-auto max-w-[34rem] text-center">
          <SectionEyebrow className="justify-center">A slower reveal</SectionEyebrow>
          <h2 className="mt-4 font-display text-[clamp(2.5rem,7vw,5.5rem)] leading-[0.9] tracking-[-0.03em] text-ink sm:mt-5">
            Only a few.
          </h2>
          <p className="mx-auto mt-4 max-w-[34rem] text-sm leading-6 text-ink-body sm:mt-6 sm:text-base sm:leading-8">
            A small, personal selection from a much broader pool of strong restaurants—so
            attention spreads instead of landing on the same few places.
          </p>
        </div>

        {/*
         * Three shelves, ruled from the first paint. The rule is on the cell and
         * the card only changes opacity, so the layout is final before any card
         * exists and an arrival cannot move anything.
         */}
        <div
          ref={ref}
          className="mx-auto mt-8 grid max-w-[62rem] gap-3 sm:mt-14 sm:grid-cols-3 sm:gap-5 lg:gap-7"
        >
          {ONLY_A_FEW_EXAMPLES.map((example, index) => (
            <div key={example.key} className="min-w-0 border-b border-line-strong pb-3 sm:pb-4">
              <div
                data-arrival={index + 1}
                className={cn("fiyu-lp-settle min-w-0", RAKE[index])}
                data-in={flag}
                style={
                  {
                    "--settle-delay": index * ARRIVAL_STEP_MS + "ms",
                    "--settle-y": "18px",
                    "--settle-scale": "0.97",
                  } as React.CSSProperties
                }
              >
                <ExamplePickCard example={example} detail="sm-up" />
              </div>
            </div>
          ))}
        </div>

        <IllustrativeNote className="mx-auto mt-7 w-fit">
          Illustrative discoveries in Los Angeles
        </IllustrativeNote>

        {/*
         * A noren hem closing the section: one continuous rail with three panels
         * of uneven drop, three panels for three discoveries, and then the rail
         * runs out. Static -- the section should not end on an animation.
         */}
        <div
          aria-hidden="true"
          className="mx-auto mt-10 hidden max-w-[30rem] items-start sm:mt-12 sm:flex"
        >
          <span className="h-px flex-1 bg-line-strong" />
          <span className="h-6 w-10 border border-line-strong" />
          <span className="h-9 w-10 border-t border-r border-b border-line-strong" />
          <span className="h-6 w-10 border-t border-r border-b border-line-strong" />
          <span className="h-px flex-1 bg-line-strong" />
        </div>
      </div>
    </section>
  );
}

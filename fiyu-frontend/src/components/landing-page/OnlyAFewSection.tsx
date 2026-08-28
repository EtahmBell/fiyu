"use client";

import { ExamplePickCard } from "@/components/landing-page/ExamplePickCard";
import { ONLY_A_FEW_EXAMPLES } from "@/components/landing-page/landingExamples";
import { LANDING_MEASURE, SectionEyebrow } from "@/components/landing-page/landingSystem";
import { usePinScene } from "@/components/landing-page/motion/scrollScene";
import { cn } from "@/lib/utils/cn";

/**
 * Only a few.
 *
 * One discovery arrives, then a second, then a third, and then the page stops
 * giving them out. This is the one section on the page that still earns a pinned
 * stage, because the argument *is* the passage of time.
 *
 * Two things were still wrong in the browser, and both were about the shape of
 * the box rather than the timing inside it.
 *
 * The stage centred its content. A 490px composition centred in an 800px sticky
 * box leaves 155px of nothing above and below it, and those two bands are
 * precisely what fills the screen as the stage arrives and as it leaves -- so a
 * recording shows a near-empty viewport at the handoff even though the
 * composition itself is fine. `justify-between` fixes it structurally: the
 * masthead sits at the top of the box, the closing rule sits at the bottom, the
 * cards sit between them, and there is content within a few dozen pixels of both
 * edges at every scroll position. The whitespace is still there; it is now
 * *between* two pieces of content, where it reads as intended.
 *
 * And the hold was too short. The finished trio held for 20svh, which is two or
 * three notches of a wheel -- long enough to satisfy a test, not long enough to
 * look at. The three arrivals now finish at 0.80 of the transition window and the
 * hold-out is 38% of the runway, so the completed composition sits still for
 * roughly 370px of scrolling before anything hands off.
 *
 * The closing rule is static, not staged. It is the structure of the empty stage,
 * present before the first card and after the last, which is also what stops the
 * section ending on an animation.
 */

/**
 * Where each card starts and finishes, in transition space. Ordered with gaps:
 * the pauses are what make three arrivals read as three decisions rather than as
 * one staggered animation, and finishing at 0.80 leaves the rest of the window
 * plus the whole hold-out with nothing moving.
 */
const ARRIVALS = [
  { from: 0.02, span: 0.22 },
  { from: 0.3, span: 0.22 },
  { from: 0.58, span: 0.22 },
] as const;

/** A whisper of rake from `sm`, where the cards sit side by side. */
const RAKE = ["sm:rotate-[-0.9deg]", "sm:rotate-[0.6deg]", "sm:rotate-[1.8deg]"] as const;

export function OnlyAFewSection() {
  const { ref } = usePinScene<HTMLDivElement>({ holdIn: 0.1, holdOut: 0.38 });

  return (
    <section id="only-a-few" className="scroll-mt-24 border-b border-line bg-lavender-50/50">
      <div
        ref={ref}
        className="fiyu-lp-scene fiyu-lp-runway relative [--runway:168svh] sm:[--runway:185svh]"
      >
        {/*
         * Top, middle, bottom -- never centred. See the note above: centring is
         * what put empty bands at both handoffs.
         */}
        <div className="fiyu-lp-stage flex flex-col justify-between overflow-hidden pt-16 pb-10 lg:pt-20 lg:pb-12">
          <div className={cn(LANDING_MEASURE, "w-full")}>
            <div className="mx-auto max-w-[34rem] text-center">
              <SectionEyebrow className="justify-center">A slower reveal</SectionEyebrow>
              <h2 className="mt-4 font-display text-[clamp(2.5rem,7vw,5.5rem)] leading-[0.9] tracking-[-0.03em] text-ink sm:mt-5">
                Only a few.
              </h2>
              <p className="mx-auto mt-4 max-w-[34rem] text-sm leading-6 text-ink-muted sm:mt-6 sm:text-base sm:leading-8">
                A small, personal selection from a much broader pool of strong restaurants—so
                attention spreads instead of landing on the same few places.
              </p>
            </div>
          </div>

          {/*
           * Three shelves. The rule is on the cell, so it is drawn from the first
           * frame and stays after the card lands: an empty frame with room for
           * exactly three things says "a small number, chosen" before a single
           * card exists.
           */}
          <div className={cn(LANDING_MEASURE, "w-full")}>
            <div className="mx-auto grid max-w-[62rem] gap-2 sm:grid-cols-3 sm:gap-5 lg:gap-7">
              {ONLY_A_FEW_EXAMPLES.map((example, index) => (
                <div key={example.id} className="min-w-0 border-b border-line-strong pb-2.5 sm:pb-4">
                  <div
                    data-arrival={index + 1}
                    className={cn(
                      "fiyu-lp-stage-item min-w-0 [--stage-scale:0.04] [--stage-y:20px]",
                      RAKE[index],
                    )}
                    style={
                      {
                        "--from": String(ARRIVALS[index].from),
                        "--span": String(ARRIVALS[index].span),
                      } as React.CSSProperties
                    }
                  >
                    <ExamplePickCard example={example} detail="sm-up" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/*
           * A noren hem closing the stage: one continuous rail with three panels
           * of uneven drop, three panels for three discoveries, and then the rail
           * runs out. Static, and anchored to the bottom of the box, which is
           * what guarantees the last thing a reader sees on the way out is
           * content rather than padding. Hidden on a phone, where the three
           * shelves already reach the lower edge.
           */}
          <div className={cn(LANDING_MEASURE, "hidden w-full sm:block")}>
            <div aria-hidden="true" className="mx-auto flex max-w-[30rem] items-start">
              <span className="h-px flex-1 bg-line-strong" />
              <span className="h-6 w-10 border border-line-strong" />
              <span className="h-9 w-10 border-t border-r border-b border-line-strong" />
              <span className="h-6 w-10 border-t border-r border-b border-line-strong" />
              <span className="h-px flex-1 bg-line-strong" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { ExamplePickCard } from "@/components/landing-page/ExamplePickCard";
import { ONLY_A_FEW_EXAMPLES } from "@/components/landing-page/landingExamples";
import { LANDING_MEASURE, SectionEyebrow } from "@/components/landing-page/landingSystem";
import { usePinScene } from "@/components/landing-page/motion/scrollScene";
import { cn } from "@/lib/utils/cn";

/**
 * Only a few.
 *
 * The section that argues by behaving: one discovery arrives, then a second, then
 * a third, and then the page stops giving them out. No counter and no fourth
 * card -- a reader should feel the end of the list rather than be told about it,
 * because that is the whole claim.
 *
 * Two things were wrong before. The heading and a five-line paragraph sat above
 * the runway in normal flow, so the pinned stage held nothing but three cards
 * that all began at zero opacity: for the first stretch of the pin the viewport
 * was genuinely blank, which is the dead screen that got reported. And the last
 * arrival landed at 0.7 of an unheld runway, so the composition a reader had
 * waited for was scrolled away almost as soon as it existed.
 *
 * Now the heading is inside the stage, three shelves are ruled from the first
 * frame, and the last card lands at 0.82 of the transition window -- so the
 * finished trio is held, at rest, for roughly a quarter of the runway before
 * anything hands off.
 *
 * The shelves do the work the copy used to. Three hairlines with card-height
 * space above them say "room for exactly three, chosen" before a single card
 * exists, and they stay after the cards land, so the composition is grounded at
 * both ends and never reads as an empty frame. That is why the paragraph could
 * lose two thirds of its length.
 *
 * A ruled row, not the hero's overlapping stack: this section is about how few
 * there are, which needs them countable and side by side.
 */

/**
 * Where each card starts and finishes, in transition space. Deliberately ordered
 * with gaps between them -- the pauses are what make three arrivals read as three
 * decisions rather than as one staggered animation.
 */
const ARRIVALS = [
  { from: 0.04, span: 0.2 },
  { from: 0.32, span: 0.2 },
  { from: 0.62, span: 0.2 },
] as const;

/** A whisper of rake from `sm`, where the cards sit side by side. */
const RAKE = [
  "sm:rotate-[-0.9deg]",
  "sm:rotate-[0.6deg]",
  "sm:rotate-[1.8deg]",
] as const;

export function OnlyAFewSection() {
  const { ref } = usePinScene<HTMLDivElement>({ holdIn: 0.12, holdOut: 0.24 });

  return (
    <section id="only-a-few" className="scroll-mt-24 border-b border-line bg-lavender-50/50">
      <div
        ref={ref}
        className="fiyu-lp-scene fiyu-lp-runway relative [--runway:168svh] sm:[--runway:185svh]"
      >
        <div className="fiyu-lp-stage flex flex-col justify-center overflow-hidden pt-16 pb-8 lg:pt-20 lg:pb-10">
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

            {/*
             * Three shelves. The rule is on the cell, not on the card, so it is
             * there from the first frame and stays after the card lands.
             */}
            <div className="mx-auto mt-6 grid max-w-[62rem] gap-2 sm:mt-12 sm:grid-cols-3 sm:gap-5 lg:gap-7">
              {ONLY_A_FEW_EXAMPLES.map((example, index) => (
                <div
                  key={example.id}
                  className="min-w-0 border-b border-line-strong pb-2.5 sm:pb-4"
                >
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

            {/*
             * A noren hem closing the sequence, kept from the section this
             * replaces. Three panels for three discoveries, and then the rail
             * runs out. Desktop only -- on a phone the three shelves already
             * carry the idea and this is the first thing worth the height.
             */}
            <div
              aria-hidden="true"
              className="fiyu-lp-hem fiyu-lp-stage-item mx-auto mt-10 max-w-[30rem] items-start [--from:0.82] [--span:0.14] [--stage-y:10px]"
            >
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

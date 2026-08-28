"use client";

import { ExamplePickCard, ExamplePickCardBrief } from "@/components/landing-page/ExamplePickCard";
import { ONLY_A_FEW_EXAMPLES } from "@/components/landing-page/landingExamples";
import {
  LANDING_HEADING,
  LANDING_MEASURE,
  LANDING_RHYTHM,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { useScrollScene } from "@/components/landing-page/motion/scrollScene";
import { cn } from "@/lib/utils/cn";

/**
 * Only a few.
 *
 * The second scroll-led sequence, and the one that argues by behaving. One
 * discovery arrives, then a second, then a third, and then the page stops
 * giving them out. There is no counter and no fourth card: the reader feels the
 * end of the list rather than being told about it, which is the whole claim.
 *
 * The heading and the reasoning sit above the stage in normal flow, in the
 * ruled two-column measure the page has used since the beginning. Only the
 * cards are pinned. That split is deliberate on two counts -- the argument is
 * readable before any motion happens, and the stage is left holding nothing but
 * three cards on an otherwise empty field, which is far quieter than the same
 * cards crowded beside a paragraph.
 *
 * The first arrival is a full card; the two that follow are brief. Three
 * identical cards read as a list, and a list is what Fiyu is not.
 */

/** Where each card starts and finishes, as a share of the pinned runway. */
const ARRIVALS = [
  { from: 0.06, span: 0.16 },
  { from: 0.3, span: 0.16 },
  { from: 0.54, span: 0.16 },
] as const;

/** Vertical stack on a phone; a shallow fan from `sm`. */
const RAKE = [
  "sm:w-[19rem] rotate-[-1.4deg] sm:translate-y-4",
  "-mt-7 sm:mt-0 sm:-ml-8 sm:w-[17rem] rotate-[1.2deg] sm:translate-y-24",
  "-mt-7 sm:mt-0 sm:-ml-8 sm:w-[17rem] rotate-[2.8deg] sm:-translate-y-6",
] as const;

export function OnlyAFewSection() {
  const { ref } = useScrollScene<HTMLDivElement>({ mode: "sticky" });
  const [first, second, third] = ONLY_A_FEW_EXAMPLES;

  return (
    <section id="only-a-few" className="scroll-mt-24 border-b border-line bg-lavender-50/50">
      <div
        className={cn(
          LANDING_MEASURE,
          LANDING_RHYTHM,
          "grid gap-10 md:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] md:gap-16",
        )}
      >
        <div className="min-w-0">
          <SectionEyebrow>A slower reveal</SectionEyebrow>
          <h2 className={cn(LANDING_HEADING, "mt-6 text-ink")}>Only a few.</h2>
        </div>

        <div className="min-w-0">
          <p className="max-w-[38rem] text-base leading-8 text-ink-muted sm:text-[1.0625rem] sm:leading-9">
            Great small restaurants can struggle with sudden attention. Fiyu reveals discoveries
            gradually through small, personalized selections drawn from a broader pool of similarly
            strong places. By varying recommendations across users instead of directing everyone to
            the same restaurants, Fiyu helps keep discovery thoughtful while reducing pressure on
            the places and communities that make them special.
          </p>
        </div>
      </div>

      <div ref={ref} className="fiyu-lp-scene relative h-[150svh] sm:h-[210svh]">
        {/* Padded rather than offset: the stage still pins at the very top, but
            its contents are centred in the space the sticky header leaves. */}
        <div className="sticky top-0 flex h-svh items-center overflow-hidden pt-16 lg:pt-20">
          <div className={cn(LANDING_MEASURE, "w-full")}>
            <div className="mx-auto flex w-full max-w-[24rem] flex-col sm:max-w-none sm:flex-row sm:items-start sm:justify-center">
              {[first, second, third].map((example, index) => (
                <div
                  key={example.id}
                  data-arrival={index + 1}
                  className={cn(
                    "fiyu-lp-stage-item min-w-0 [--stage-y:30px]",
                    RAKE[index],
                  )}
                  style={
                    {
                      "--from": String(ARRIVALS[index].from),
                      "--span": String(ARRIVALS[index].span),
                    } as React.CSSProperties
                  }
                >
                  {index === 0 ? (
                    <ExamplePickCard example={example} />
                  ) : (
                    <ExamplePickCardBrief example={example} />
                  )}
                </div>
              ))}
            </div>

            {/*
             * A noren hem closing the sequence: one continuous rail with three
             * panels of uneven drop, kept from the section this replaces. Three
             * panels for three discoveries, and then the rail runs out.
             */}
            <div
              aria-hidden="true"
              className="fiyu-lp-stage-item mx-auto mt-14 flex max-w-[32rem] items-start [--from:0.74] [--span:0.18] [--stage-y:12px]"
            >
              <span className="h-px flex-1 bg-line-strong" />
              <span className="h-7 w-11 border border-line-strong" />
              <span className="h-10 w-11 border-t border-r border-b border-line-strong" />
              <span className="h-7 w-11 border-t border-r border-b border-line-strong" />
              <span className="h-px flex-1 bg-line-strong" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

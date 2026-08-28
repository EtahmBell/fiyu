"use client";

import { ExamplePickCardBrief } from "@/components/landing-page/ExamplePickCard";
import { WORKFLOW_EXAMPLES } from "@/components/landing-page/landingExamples";
import {
  LANDING_HEADING,
  LANDING_MEASURE,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { usePinScene } from "@/components/landing-page/motion/scrollScene";
import { TagList } from "@/components/restaurant/TagList";
import { cn } from "@/lib/utils/cn";

/**
 * How Fiyu works, on one Fiyu surface.
 *
 * The previous version of this section was the worst thing on the page. The
 * surface was a short sticky panel top-aligned in a grid column while each step
 * occupied nearly two thirds of a viewport in the column beside it, so a reader
 * at step 02 saw a 23rem panel in the top-left, one paragraph centred right, and
 * several hundred pixels of nothing in between. Three states also swapped by
 * mounting and unmounting, which changed the panel's height mid-scroll.
 *
 * Rebuilt as one pinned stage:
 *
 *  - Both surface layers are mounted at all times and cross-fade. Nothing
 *    mounts, nothing unmounts, the box is a fixed height, so no height changes
 *    and no card jumps.
 *  - All three steps are always on screen as a ruled index. The active one is
 *    emphasised; the other two stay fully legible. The column can never be empty
 *    because it always holds three rows of type.
 *  - Nothing in the stage uses staged opacity. At the start of the pin the
 *    screen is a finished composition, and so is the end. The only thing that
 *    happens in between is a cross-fade and a change of tense.
 *
 * The surface only ever shows states the application has. Fiyu's ranking control
 * has no popularity data behind it yet, so no popularity slider is drawn; what is
 * drawn is food-tag interests, areas, the daily picks, and the champagne
 * treatment a place takes on once it has been saved. A marketing page that
 * invents a control is a promise somebody has to keep.
 *
 * The whole surface is `aria-hidden`: it is a depiction of the product, and the
 * three steps beside it are what actually carries the meaning.
 */

const STEPS = [
  {
    number: "01",
    title: "Tell us what you like",
    copy: "Choose your food interests and how adventurous you want to be.",
  },
  {
    number: "02",
    title: "Receive a few considered picks",
    copy: "Fiyu selects a small daily set instead of giving you an endless feed.",
  },
  {
    number: "03",
    title: "Reveal, save, and visit",
    copy: "Explore each restaurant, keep the ones you love, and experience the city thoughtfully.",
  },
] as const;

/**
 * Two thresholds in transition space, so each of the three states owns roughly a
 * third of it. With the stage's holds, that gives state 01 and state 03 the
 * longest time at rest -- they are the two a reader arrives and leaves on.
 */
const STEP_THRESHOLDS = [0.3, 0.7] as const;

const INTERESTS = ["焼き鳥", "ramen", "Okinawa soba", "dumplings", "Turkish cuisine"];
const AREAS = ["Yanaka", "Sendagi", "Nezu"];

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-ink-faint uppercase">
      {children}
    </p>
  );
}

/** State 01: what a reader hands Fiyu. Tags and areas, no map -- the plate is the hero's. */
function TasteSurface() {
  return (
    <div className="flex h-full flex-col">
      <PanelLabel>Your tastes</PanelLabel>
      <TagList tags={INTERESTS} className="mt-3.5" />
      <div className="mt-auto border-t border-line pt-4">
        <PanelLabel>Around you</PanelLabel>
        <ul className="mt-3 space-y-2">
          {AREAS.map((area) => (
            <li key={area} className="flex items-center gap-2.5">
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-lavender-500" />
              <span className="text-sm text-ink">{area}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * States 02 and 03: the picks, and then one of them saved.
 *
 * The saved card stays where it is and changes tense instead of place. Moving it
 * into a separate history group was the truer picture of the application, but it
 * also changed the surface's height mid-scroll.
 */
function PicksSurface({ saved }: { saved: boolean }) {
  const [first, ...rest] = WORKFLOW_EXAMPLES;
  return (
    <div className="flex h-full flex-col">
      <PanelLabel>Today</PanelLabel>
      <div className="mt-3.5 space-y-2 sm:space-y-2.5">
        <ExamplePickCardBrief example={first} tone={saved ? "saved" : "current"} />
        {rest.map((example) => (
          <ExamplePickCardBrief key={example.id} example={example} />
        ))}
      </div>
    </div>
  );
}

const LAYER = "absolute inset-0 transition-opacity duration-[600ms] ease-(--ease-fiyu)";

export function HowFiyuWorks() {
  const { ref, step } = usePinScene<HTMLDivElement>({ steps: STEP_THRESHOLDS });

  return (
    <section id="how-it-works" className="scroll-mt-24 border-b border-line bg-canvas">
      <div className={cn(LANDING_MEASURE, "pt-20 pb-2 sm:pt-24 lg:pt-28")}>
        <SectionEyebrow>The product</SectionEyebrow>
        <h2 className={cn(LANDING_HEADING, "mt-6 text-ink")}>How Fiyu works</h2>
      </div>

      <div
        ref={ref}
        className="fiyu-lp-scene fiyu-lp-runway relative [--runway:172svh] lg:[--runway:190svh]"
      >
        <div className="fiyu-lp-stage flex items-center overflow-hidden pt-16 pb-8 lg:pt-20">
          <div
            className={cn(
              LANDING_MEASURE,
              "grid w-full gap-6",
              "lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:items-center lg:gap-16",
            )}
          >
            {/*
             * One surface, two layers, both always mounted. Cross-fading rather
             * than swapping is what keeps the box a fixed height and stops the
             * cards jumping as the state changes.
             */}
            <div
              aria-hidden="true"
              data-testid="workflow-surface"
              data-step={step}
              className="relative h-[21.5rem] min-w-0 overflow-hidden rounded-card border border-line bg-surface lg:h-[23rem]"
            >
              <div className={cn(LAYER, step === 0 ? "opacity-100" : "opacity-0")}>
                <div className="size-full p-3.5 sm:p-5">
                  <TasteSurface />
                </div>
              </div>
              <div className={cn(LAYER, step === 0 ? "opacity-0" : "opacity-100")}>
                <div className="size-full p-3.5 sm:p-5">
                  <PicksSurface saved={step === 2} />
                </div>
              </div>
            </div>

            {/*
             * All three steps, always. The active one carries ink and a lavender
             * rule; the others stay at AA on canvas rather than fading out, so
             * the column is never a single paragraph floating in white space.
             *
             * On a phone only the active step shows its copy -- the other two
             * keep their titles and move their copy to the accessibility tree,
             * so nothing is removed, only condensed.
             */}
            <ol className="min-w-0">
              {STEPS.map((entry, index) => {
                const active = step === index;
                return (
                  <li
                    key={entry.number}
                    data-active={active}
                    aria-current={active ? "step" : undefined}
                    className="border-t border-line py-2.5 first:border-t-0 first:pt-0 sm:py-4 lg:py-6"
                  >
                    <div className="flex items-baseline gap-4">
                      <p
                        aria-hidden="true"
                        className={cn(
                          "font-display text-[1.5rem] leading-none transition-colors duration-500 ease-(--ease-fiyu) lg:text-[2.25rem]",
                          active ? "text-lavender-700" : "text-ink-faint/60",
                        )}
                      >
                        {entry.number}
                      </p>
                      <h3
                        className={cn(
                          "min-w-0 font-display text-[1.125rem] leading-[1.15] transition-colors duration-500 ease-(--ease-fiyu) sm:text-[1.375rem] lg:text-[1.75rem]",
                          active ? "text-ink" : "text-ink-muted",
                        )}
                      >
                        {entry.title}
                      </h3>
                    </div>
                    <p
                      data-active={active}
                      className="fiyu-lp-step-copy mt-3 max-w-[24rem] text-[0.9375rem] leading-6 text-ink-muted lg:mt-4 lg:leading-7"
                    >
                      {entry.copy}
                    </p>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-3 hidden h-px origin-left bg-lavender-500 transition-transform duration-[600ms] ease-(--ease-fiyu) sm:block lg:mt-5",
                        active ? "scale-x-100" : "scale-x-0",
                      )}
                    />
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

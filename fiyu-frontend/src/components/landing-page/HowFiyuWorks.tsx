"use client";

import { ExamplePickCardBrief } from "@/components/landing-page/ExamplePickCard";
import { WORKFLOW_EXAMPLES } from "@/components/landing-page/landingExamples";
import {
  LANDING_HEADING,
  LANDING_MEASURE,
  LANDING_RHYTHM,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { useEntered, useTimedSteps } from "@/components/landing-page/motion/scrollScene";
import { TagList } from "@/components/restaurant/TagList";
import { cn } from "@/lib/utils/cn";

/**
 * How Fiyu works, on one Fiyu surface, on one screen.
 *
 * This section has now failed twice as a pinned stage, and the reason is
 * structural rather than arithmetic. The demonstration is about 500 pixels tall.
 * Pinning it means putting 500 pixels of content inside a viewport-tall sticky
 * box, and the leftover 250 pixels do not disappear -- they sit at the top and
 * bottom of that box, and they are exactly what fills the screen while the stage
 * is arriving and leaving. A browser recording shows that as an empty viewport,
 * and it shows the two columns as sparse, because a 368px panel centred in an
 * 800px box next to a taller column of text genuinely is sparse. No amount of
 * further scroll arithmetic fixes a box that is bigger than what is in it.
 *
 * So the pin is gone. No runway, no sticky, no scroll coupling at all. The
 * section is one ordinary screen:
 *
 *  - The surface stretches to the full height of the steps column, so neither
 *    side of the grid has empty space in it.
 *  - All three steps are visible with all of their copy -- there is no height
 *    budget to condense for any more.
 *  - The surface advances 01 -> 02 -> 03 on a timer once the section arrives,
 *    with the active step highlighted by the same value, so text and visual
 *    cannot disagree. It holds on 03 and never loops.
 *
 * A reader no longer paces the demonstration. That is the trade, and it is worth
 * it: a section that is always a composed screen beats one a reader can scrub
 * into an awkward frame. Scroll duration drops from about 1.9 viewports to one.
 *
 * The surface only shows states the application has. Fiyu's ranking control has
 * no popularity data behind it yet, so no popularity slider is drawn; what is
 * drawn is food-tag interests, areas, the daily picks, and the champagne
 * treatment a place takes on once it has been saved.
 *
 * The whole surface is `aria-hidden`: it is a depiction of the product, and the
 * three steps beside it carry the meaning.
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

/** Long enough to read the step it lands on, short enough not to be a wait. */
const STEP_HOLD_MS = 2100;

const INTERESTS = ["焼き鳥", "ramen", "Okinawa soba", "sushi", "Turkish cuisine"];
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
 * also changed the surface's height as the state changed.
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
  const { ref, entered } = useEntered<HTMLElement>("0px 0px -25% 0px");
  const step = useTimedSteps({ start: entered, count: 3, intervalMs: STEP_HOLD_MS });
  const flag = entered ? "true" : "false";

  return (
    <section
      id="how-it-works"
      ref={ref}
      className="scroll-mt-24 border-b border-line bg-canvas"
    >
      <div className={cn(LANDING_MEASURE, LANDING_RHYTHM)}>
        <SectionEyebrow>The product</SectionEyebrow>
        <h2 className={cn(LANDING_HEADING, "mt-6 text-ink")}>How Fiyu works</h2>

        {/*
         * `items-stretch` is the whole layout fix. The surface takes the height
         * of the steps column rather than floating at its own size inside a
         * taller box, so there is no empty half of the grid at any width.
         */}
        <div
          className={cn(
            "mt-10 grid gap-8 lg:mt-14",
            "lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:items-stretch lg:gap-16",
          )}
        >
          <div
            aria-hidden="true"
            data-testid="workflow-surface"
            data-step={step}
            className={cn(
              "fiyu-lp-rise relative h-[21.5rem] min-w-0 overflow-hidden rounded-card",
              "border border-line bg-surface lg:h-auto lg:min-h-[23rem]",
            )}
            data-in={flag}
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
           * All three steps, all of their copy, always. The active one carries
           * ink, a lavender numeral and a drawn rule; the others stay at AA on
           * canvas rather than fading, so nothing here is ever a lone paragraph
           * in white space.
           */}
          <ol className="min-w-0">
            {STEPS.map((entry, index) => {
              const active = step === index;
              return (
                <li
                  key={entry.number}
                  data-active={active}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "fiyu-lp-rise border-t border-line py-5 first:border-t-0 first:pt-0 lg:py-7",
                    "lg:first:pt-0",
                  )}
                  data-in={flag}
                  style={
                    {
                      "--rise-delay": index * 110 + 80 + "ms",
                      "--rise-from": "12px",
                    } as React.CSSProperties
                  }
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
                        "min-w-0 font-display text-[1.25rem] leading-[1.15] transition-colors duration-500 ease-(--ease-fiyu) sm:text-[1.5rem] lg:text-[1.875rem]",
                        active ? "text-ink" : "text-ink-muted",
                      )}
                    >
                      {entry.title}
                    </h3>
                  </div>
                  <p className="mt-3 max-w-[26rem] text-[0.9375rem] leading-7 text-ink-muted lg:mt-4">
                    {entry.copy}
                  </p>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-4 block h-px origin-left bg-lavender-500 transition-transform duration-[600ms] ease-(--ease-fiyu) lg:mt-5",
                      active ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

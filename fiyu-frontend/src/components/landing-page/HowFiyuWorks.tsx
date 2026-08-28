"use client";

import { ExamplePickCardBrief } from "@/components/landing-page/ExamplePickCard";
import { WORKFLOW_EXAMPLES } from "@/components/landing-page/landingExamples";
import {
  LANDING_HEADING,
  LANDING_MEASURE,
  LANDING_RHYTHM,
} from "@/components/landing-page/landingSystem";
import { NearbyDiscoveryPlate } from "@/components/landing-page/NearbyDiscoveryPlate";
import { useScrollScene } from "@/components/landing-page/motion/scrollScene";
import { TagList } from "@/components/restaurant/TagList";
import { cn } from "@/lib/utils/cn";

/**
 * How Fiyu works, shown on a Fiyu surface.
 *
 * The three steps are unchanged in wording and order. What changed is that they
 * no longer sit in three static columns: the surface beside them is pinned and
 * advances as each step is read, so a reader watches tastes become picks and a
 * pick become a discovery rather than reading three descriptions of it.
 *
 * The surface only ever shows states the application actually has. Fiyu's
 * ranking control has no popularity data behind it yet, so no popularity slider
 * is drawn here; what is drawn is food-tag interests, a nearby area, the daily
 * picks, and the champagne treatment a place takes on once it has been saved --
 * all of which exist. A marketing page that invents a control is a promise
 * somebody has to keep.
 *
 * Step changes are the only thing in this section that reaches React, and there
 * are two of them.
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
 * Two thresholds, three steps, and the last is also the reduced-motion state.
 *
 * Chosen against the runway rather than by feel: each step block is a little
 * under two thirds of a viewport, and these are the two points at which the
 * block crossing the middle of the screen changes.
 */
const STEP_THRESHOLDS = [0.3, 0.78] as const;

const INTERESTS = ["焼き鳥", "ramen", "Okinawa soba", "dumplings", "Turkish cuisine"];

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-ink-faint uppercase">
      {children}
    </p>
  );
}

function TasteSurface() {
  return (
    <>
      <PanelLabel>Your tastes</PanelLabel>
      <TagList tags={INTERESTS} className="mt-3.5" />
      <div className="mt-6 border-t border-line pt-5">
        <PanelLabel>Nearby</PanelLabel>
        <div className="mt-3 h-24 overflow-hidden rounded-lg border border-line sm:h-28">
          <NearbyDiscoveryPlate />
        </div>
      </div>
    </>
  );
}

/**
 * The three picks, and then one of them saved.
 *
 * The saved card stays exactly where it is and changes tense instead of place.
 * Reordering it into a separate history group was the truer picture of the
 * application, but it also changed the surface's height mid-scroll, which
 * shifts the steps underneath it on a phone. A champagne rule, a filled
 * bookmark and the word "Discovered" say the same thing and cost nothing.
 */
function PicksSurface({ saved }: { saved: boolean }) {
  const [first, ...rest] = WORKFLOW_EXAMPLES;
  return (
    <>
      <PanelLabel>Today</PanelLabel>
      <div className="mt-3.5 space-y-2.5">
        <ExamplePickCardBrief example={first} tone={saved ? "saved" : "current"} />
        {rest.map((example) => (
          <ExamplePickCardBrief key={example.id} example={example} />
        ))}
      </div>
    </>
  );
}

export function HowFiyuWorks() {
  const { ref, step } = useScrollScene<HTMLDivElement>({
    mode: "sticky",
    steps: STEP_THRESHOLDS,
  });

  return (
    <section id="how-it-works" className="scroll-mt-24 border-b border-line bg-canvas">
      <div className={cn(LANDING_MEASURE, LANDING_RHYTHM)}>
        <h2 className={cn(LANDING_HEADING, "text-ink")}>How Fiyu works</h2>

        {/*
         * A block on a phone and a two-column grid from `lg`, so the pinned
         * surface has a tall containing block either way: on a phone the steps
         * scroll up beneath it, on a desktop they scroll beside it.
         */}
        <div
          ref={ref}
          className="fiyu-lp-scene mt-12 lg:mt-16 lg:grid lg:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)] lg:items-start lg:gap-16"
        >
          <div className="sticky top-[4.5rem] z-10 bg-canvas pb-4 lg:top-28 lg:pb-0">
            <div
              data-testid="workflow-surface"
              data-step={step}
              className="min-w-0 rounded-card border border-line bg-surface p-4 sm:p-5"
            >
              {/*
                A fixed height, not a minimum. The three states differ in
                content, and letting the surface resize as they swap would shift
                the page while somebody is scrolling it.
              */}
              <div className="h-[22rem] overflow-hidden sm:h-[23rem]">
                {step === 0 ? <TasteSurface /> : <PicksSurface saved={step === 2} />}
              </div>
            </div>
          </div>

          <ol className="mt-4 lg:mt-0">
            {STEPS.map((entry, index) => {
              const active = step === index;
              return (
                <li
                  key={entry.number}
                  aria-current={active ? "step" : undefined}
                  className="flex min-h-[46svh] flex-col justify-center border-t border-line py-10 first:border-t-0 lg:min-h-[64svh] lg:py-0"
                >
                  <div className="flex items-center gap-4">
                    <p
                      aria-hidden="true"
                      className={cn(
                        "font-display text-[2.5rem] leading-none transition-colors duration-500 ease-(--ease-fiyu)",
                        active ? "text-lavender-700" : "text-rose-dust",
                      )}
                    >
                      {entry.number}
                    </p>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-px flex-1 origin-left transition-[background-color,opacity] duration-500 ease-(--ease-fiyu)",
                        active ? "bg-lavender-500 opacity-100" : "bg-line opacity-70",
                      )}
                    />
                  </div>
                  <h3 className="mt-6 max-w-[18rem] font-display text-[1.75rem] leading-[1.15] text-ink">
                    {entry.title}
                  </h3>
                  <p
                    className={cn(
                      "mt-4 max-w-[22rem] text-[0.9375rem] leading-7 transition-colors duration-500 ease-(--ease-fiyu)",
                      active ? "text-ink" : "text-ink-muted",
                    )}
                  >
                    {entry.copy}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

"use client";

import {
  ExamplePickCardBrief,
  IllustrativeNote,
} from "@/components/landing-page/ExamplePickCard";
import { WORKFLOW_EXAMPLES } from "@/components/landing-page/fictionalRestaurantExamples";
import {
  LANDING_HEADING,
  LANDING_MEASURE,
  LANDING_RHYTHM,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { useActiveStep, useEntered } from "@/components/landing-page/motion/scrollScene";
import { TagList } from "@/components/restaurant/TagList";
import { cn } from "@/lib/utils/cn";

/**
 * How Fiyu works: three product states, on one surface.
 *
 * Third architecture, and the first one that is neither pinned to the viewport
 * nor on a timer.
 *
 * A pinned runway put the demonstration in a viewport-tall sticky box, and the
 * box's leftover space became a dead screen at both handoffs. A timer fixed that
 * but pointed the wrong way: it ran forward regardless of scroll direction, so
 * going back up left the copy and the surface disagreeing.
 *
 * What actually works is to ask the page a question instead of telling it a
 * story. The three step blocks are ordinary content in the right-hand column.
 * Whichever one is crossing the middle of the viewport is the active state, and
 * the surface on the left shows it. That is symmetric by construction -- down
 * gives 01, 02, 03 and up gives 03, 02, 01 -- because it is a position, not a
 * sequence being played.
 *
 * The step headings are also buttons. A click sets the state and moves nothing:
 * scrolling the clicked row onto the observer's line put the selected number near
 * the foot of the screen, which framed the composition badly for the sake of an
 * invariant nobody can see. Because the whole band now fits one screen, a click
 * behaves like a product-demo tab and the composition stays where it is. Scroll
 * still updates the state as a reader passes through, and a click simply holds
 * until the next scroll changes the honest answer.
 *
 * The geometry is the fix in this pass. Previously the step column ran half a
 * screen longer than the surface beside it, so the demonstration finished while
 * the copy kept going, and a sticky surface could be pushed under the header and
 * clipped. Now the two columns are the same height by construction -- three step
 * rows at roughly 150px against a 28rem panel -- and on desktop nothing is sticky
 * at all, because matched columns have nothing to stick for. One bounded band,
 * never clipped, both halves ending together.
 *
 * A phone still needs the surface pinned, since the columns stack there and the
 * panel would otherwise scroll away while step 03 is being read. So it is
 * `sticky` up to `lg` and static above it: one class, no JavaScript.
 *
 * The heavy white card around the panel is also gone. It read as a generic
 * dashboard embedded in an editorial page. What defines the surface now is a pair
 * of hairlines and the pick cards' own white -- the content is the surface.
 *
 * The surface only shows states the application has. Fiyu's ranking control has
 * no popularity data behind it yet, so no popularity slider is drawn; what is
 * drawn is food-tag interests, areas, the daily picks, and the champagne
 * treatment a place takes on once it has been saved.
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

const INTERESTS = ["claypot", "hand-pulled noodles", "counter seating", "late hours"];
const AREAS = ["Lower East Side", "Nolita", "Chinatown"];

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-ink-faint uppercase">
      {children}
    </p>
  );
}

/**
 * State 01: what a reader hands Fiyu. Interests and nearby areas, New York, so
 * the demonstration is visibly not Tokyo-shaped.
 *
 * `justify-between` rather than a stack, so the two groups reach the top and the
 * bottom of the panel and it does not read as a mostly-empty field.
 */
function TasteSurface() {
  return (
    <div className="flex h-full flex-col justify-between gap-6">
      <TagList tags={INTERESTS} />
      <div>
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
 * Brief cards, spread to the full height of the panel. Three cards with images
 * would not fit a panel matched to the step column, and the point of this state
 * is the set of three rather than any one of them.
 *
 * The saved card stays where it is and changes tense instead of place. Moving it
 * into a separate history group was the truer picture of the application, but it
 * also changed the panel's height as the state changed.
 */
function PicksSurface({ saved }: { saved: boolean }) {
  const [first, ...rest] = WORKFLOW_EXAMPLES;
  return (
    <div className="flex h-full flex-col justify-between gap-2.5">
      <ExamplePickCardBrief example={first} tone={saved ? "saved" : "current"} />
      {rest.map((example) => (
        <ExamplePickCardBrief key={example.key} example={example} />
      ))}
    </div>
  );
}

const LAYER = "absolute inset-0 transition-opacity duration-[520ms] ease-(--ease-fiyu)";

export function HowFiyuWorks() {
  const { ref, entered } = useEntered<HTMLElement>("0px 0px -25% 0px");
  const { register, active, select } = useActiveStep(STEPS.length, { scrollOnSelect: false });
  const flag = entered ? "true" : "false";

  return (
    <section id="how-it-works" ref={ref} className="scroll-mt-24 border-b border-line bg-canvas">
      <div className={cn(LANDING_MEASURE, LANDING_RHYTHM)}>
        <SectionEyebrow>The product</SectionEyebrow>
        <h2 className={cn(LANDING_HEADING, "mt-6 text-ink")}>How Fiyu works</h2>

        <div
          className={cn(
            "mt-10 lg:mt-14",
            "lg:grid lg:grid-cols-[minmax(0,0.44fr)_minmax(0,0.56fr)] lg:items-start lg:gap-16",
          )}
        >
          {/*
           * Sticky only where the columns stack. From `lg` the two columns are
           * the same height, so there is nothing to stick for and nothing that
           * can be clipped against the header.
           */}
          <div className="sticky top-16 z-10 bg-canvas pb-4 lg:static lg:pb-0">
            <div
              aria-hidden="true"
              data-testid="workflow-surface"
              data-step={active}
              className="fiyu-lp-rise flex h-[min(25rem,58svh)] min-w-0 flex-col lg:h-[28rem]"
              data-in={flag}
            >
              <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-ink-faint uppercase">
                {active === 0 ? "Your tastes" : "Today"}
              </p>
              {/*
                Two hairlines and the cards' own white, instead of a large rounded
                container. The heavy card read as a dashboard dropped into an
                editorial page; here the content defines the surface.
              */}
              <div className="relative mt-3 min-h-0 flex-1 border-y border-line py-4">
                <div className={cn(LAYER, active === 0 ? "opacity-100" : "opacity-0")}>
                  <div className="size-full">
                    <TasteSurface />
                  </div>
                </div>
                <div className={cn(LAYER, active === 0 ? "opacity-0" : "opacity-100")}>
                  <div className="size-full">
                    <PicksSurface saved={active === 2} />
                  </div>
                </div>
              </div>
              <IllustrativeNote className="mt-3">Illustrative examples</IllustrativeNote>
            </div>
          </div>

          {/*
           * Each block is tall enough that only one of them owns the middle of
           * the viewport at a time, which is what makes the active state
           * unambiguous in both directions.
           */}
          <ol className="mt-8 lg:mt-0">
            {STEPS.map((entry, index) => {
              const isActive = active === index;
              return (
                <li
                  key={entry.number}
                  ref={register(index)}
                  data-active={isActive}
                  aria-current={isActive ? "step" : undefined}
                  className="flex min-h-[15rem] flex-col justify-center border-t border-line py-6 first:border-t-0 lg:min-h-0 lg:py-3 lg:first:pt-0"
                >
                  {/*
                   * The heading is the control. A text button with a hover rule,
                   * not a chip: this is an editorial index that happens to be
                   * operable, and the copy below it is visible either way, so
                   * nothing is gated behind the interaction.
                   */}
                  <button
                    type="button"
                    onClick={() => select(index)}
                    className="group flex w-full items-baseline gap-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lavender-500"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "font-display text-[1.5rem] leading-none transition-colors duration-500 ease-(--ease-fiyu) lg:text-[2.25rem]",
                        isActive ? "text-lavender-700" : "text-ink-faint/60 group-hover:text-ink-muted",
                      )}
                    >
                      {entry.number}
                    </span>
                    <h3
                      className={cn(
                        "min-w-0 font-display text-[1.25rem] leading-[1.15] transition-colors duration-500 ease-(--ease-fiyu) sm:text-[1.5rem] lg:text-[1.875rem]",
                        isActive
                          ? "text-ink"
                          : "text-ink-muted decoration-rose-dust decoration-1 underline-offset-[6px] group-hover:text-ink group-hover:underline",
                      )}
                    >
                      {entry.title}
                    </h3>
                  </button>
                  <p className="mt-3 max-w-[26rem] text-[0.9375rem] leading-7 text-ink-muted lg:mt-4">
                    {entry.copy}
                  </p>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-4 block h-px origin-left bg-lavender-500 transition-transform duration-[600ms] ease-(--ease-fiyu) lg:mt-5",
                      isActive ? "scale-x-100" : "scale-x-0",
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

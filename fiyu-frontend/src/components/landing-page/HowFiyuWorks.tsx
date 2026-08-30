"use client";

import Image from "next/image";
import { useState } from "react";

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
import { useEntered } from "@/components/landing-page/motion/scrollScene";
import { WorkflowLocationPlate } from "@/components/landing-page/WorkflowLocationPlate";
import { useIsDesktop } from "@/lib/hooks/useMediaQuery";
import { cn } from "@/lib/utils/cn";

/**
 * How Fiyu works: three product states, on one surface.
 *
 * Step 01 used to be "Tell us what you like", with food interests and an
 * adventurousness control. That was a description of a product Fiyu does not
 * have. The Picks flow begins with a reader's location, so the first state is a
 * place, and the preference controls are gone rather than relegated -- a
 * marketing page that describes a screen nobody can reach is worse than one that
 * describes less.
 *
 * The three states are one surface evolving, not three mockups: a location, the
 * nearby picks that location produced, and one of those picks acted on. State 01
 * is now the supplied map plate rather than a drawn one; the footprint is
 * unchanged, because the panel's height is fixed and the plate is capped inside
 * it.
 *
 * State 01 is now a first-party graphic rather than an image: see
 * `WorkflowLocationPlate`. It carries its own ambient life -- a ring pinging out
 * of the reader's position, three nearby places noticing themselves in turn, the
 * local field breathing, the street grid drifting under all of it. In states 02
 * and 03 the pick cards lift two pixels under a pointer. None of it fires on a
 * touch screen or under reduced motion, and none of it moves anything in the
 * layout. The panel
 * keeps the same header line -- NEAR LOWER EAST SIDE -- through all three, which
 * is what ties the picks to the place rather than leaving them adjacent to it.
 *
 * One interaction model at every width: click or tap a step, and only that
 * changes the state. Nothing observes scroll, nothing advances on a timer, and
 * selecting a step never moves the page.
 *
 * The control differs because the layout does. On a desktop the columns sit side
 * by side, all three numbered headings are visible, and each is the button for
 * its own state; both columns are about 450px, so neither outruns the other and
 * nothing needs to stick or can be clipped. On a phone the columns have stacked,
 * so only the selected step's copy is shown and a strip of three numbers above it
 * is the control -- one set of buttons either way, never two.
 *
 * `useIsDesktop` reports false on the server and on the first client render, so
 * the tab behaviour is the default and desktop is the enhancement. That is the
 * right way round: a phone is never waiting on a media query to become usable.
 */

const STEPS = [
  {
    number: "01",
    title: "Start with where you are",
    copy: "When you ask for new Picks, Fiyu starts with your current location.",
  },
  {
    number: "02",
    title: "Receive a few considered picks",
    copy: "Fiyu surfaces a small selection nearby instead of giving you an endless feed.",
  },
  {
    number: "03",
    title: "Reveal, save, and visit",
    copy: "Explore each place, keep the ones you love, and experience the city thoughtfully.",
  },
] as const;

/** The one line that never changes, and the reason the three states are one story. */
const PANEL_LABEL = "Near Lower East Side";

const LAYER = "absolute inset-0 transition-opacity duration-[520ms] ease-(--ease-fiyu)";

/**
 * State 02: the picks that location produced. Three equal candidates, none
 * chosen yet -- the whole point of the state is that nothing has been decided.
 */
function PicksSurface() {
  return (
    <div className="flex h-full flex-col justify-between gap-2">
      {WORKFLOW_EXAMPLES.map((example) => (
        <ExamplePickCardBrief key={example.key} example={example} className="fiyu-lp-lift" />
      ))}
    </div>
  );
}

/*
 * Three supporting frames for state 03.
 *
 * Each crop is chosen against the actual photograph, and the exterior's is
 * chosen for one hard reason: the lower third of that frame carries a real
 * restaurant's name, street address and telephone number in legible type. This
 * page shows invented restaurants on purpose, and hanging a real business's
 * contact details under the name "Canal Claypot" would be worse than a weaker
 * crop -- it would be a false claim about a real place. Anchoring to the top
 * keeps the neon characters, the menu board and the fire escape, which is the
 * Chinatown reading the strip needs, and drops every identifier.
 */
const DETAIL_IMAGES = [
  // 2947x4421. Visible band ends at about two thirds; the signage begins below it.
  { src: "/landing/step03_cantonese_exterior.jpg", objectPosition: "50% 0%" },
  // 4000x6000. Held just low enough for the lanterns and the menu board together.
  { src: "/landing/step03_cantonese_interior.jpg", objectPosition: "50% 30%" },
  // 3024x4032. Weighted low so the claypot fills the square rather than the room.
  { src: "/landing/step03_cantonese_dish.jpg", objectPosition: "50% 60%" },
] as const;

/**
 * State 03: one of those picks kept, and opened.
 *
 * This was the same three cards as state 02 with the first one tinted gold, and
 * at a glance the two states were indistinguishable -- which made the third step
 * of a three step story read as a repeat. So the state now does what the copy
 * says: it drops to a single restaurant and opens it.
 *
 * The card and the detail share one frame, which is why the card is rendered
 * `flush`. Two nested borders would read as a card sitting on a panel; one
 * border reads as a card that expanded, which is the gesture being illustrated.
 *
 * The strip is a real horizontal scroller with snap points, not a fake one. On a
 * phone the three squares overrun the frame by a few pixels, so the edge of the
 * third is visibly clipped and a drag actually moves it; at desktop they are
 * sized to fit, because there is nothing to discover in a scroller whose content
 * is already fully visible.
 */
function SavedSurface() {
  const [kept] = WORKFLOW_EXAMPLES;
  return (
    <div className="flex h-full flex-col justify-center">
      <div
        data-testid="workflow-saved-detail"
        className={cn(
          "fiyu-lp-lift overflow-hidden rounded-card border border-line border-t-gold/60",
          "bg-surface shadow-[0_18px_44px_-30px_rgba(49,40,61,0.55)]",
        )}
      >
        <ExamplePickCardBrief example={kept} tone="saved" frame="flush" />
        <div className="border-t border-line bg-canvas/50 px-2 pt-2 pb-2 sm:px-3 sm:pt-2.5 sm:pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[0.5625rem] font-semibold tracking-[0.16em] text-gold-700 uppercase">
              Saved to your list
            </p>
            {/* The saved footer trades the area for "Discovered", so it returns here. */}
            <p className="text-[0.5625rem] font-semibold tracking-[0.16em] text-ink-faint uppercase">
              {kept.area}
            </p>
          </div>
          <ul
            data-testid="workflow-detail-strip"
            className={cn(
              "mt-2 flex snap-x gap-1.5 overflow-x-auto overflow-y-hidden sm:gap-2",
              "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            )}
          >
            {DETAIL_IMAGES.map((image) => (
              <li
                key={image.src}
                className={cn(
                  "fiyu-lp-thumb relative aspect-square w-[33%] shrink-0 snap-start",
                  "overflow-hidden rounded-sm border border-line bg-subtle sm:w-[31%]",
                )}
              >
                <Image
                  src={image.src}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 11rem, 30vw"
                  style={{ objectPosition: image.objectPosition }}
                  className="object-cover"
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** The phone control. Restrained editorial tabs, never pills. */
function StepTab({
  number,
  title,
  selected,
  onSelect,
}: {
  number: string;
  title: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "relative inline-flex min-h-11 min-w-11 items-center justify-center px-1",
        "font-display text-[1.375rem] leading-none",
        "transition-colors duration-300 ease-(--ease-fiyu)",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-500",
        selected ? "text-lavender-700" : "text-ink-faint",
      )}
    >
      {number}
      <span className="sr-only">{`: ${title}`}</span>
      {/* Always rendered and only scaled, so the strip's height never changes. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 -bottom-px h-[2px] origin-left bg-lavender-500",
          "transition-transform duration-300 ease-(--ease-fiyu)",
          selected ? "scale-x-100" : "scale-x-0",
        )}
      />
    </button>
  );
}

export function HowFiyuWorks() {
  const { ref, entered } = useEntered<HTMLElement>({ rootMargin: "0px 0px -20% 0px" });
  const isDesktop = useIsDesktop();
  /*
   * Plain state, and nothing else touches it.
   *
   * Scroll position drove this for two passes and never felt deliberate: the
   * section is a viewport and a half tall, so a single wheel gesture could cross
   * all three states before a reader had read one of them. It is a small product
   * demonstration, so it behaves like one -- it opens on 01 and changes only when
   * somebody asks it to. Scrolling past now just scrolls, and scrolling back
   * finds whichever state was last chosen.
   */
  const [active, setActive] = useState(0);
  const flag = entered ? "true" : "false";

  return (
    <section id="how-it-works" ref={ref} className="scroll-mt-24 border-b border-line bg-canvas">
      <div className={cn(LANDING_MEASURE, LANDING_RHYTHM)}>
        <SectionEyebrow>The product</SectionEyebrow>
        <h2 className={cn(LANDING_HEADING, "mt-5 text-ink sm:mt-6")}>How Fiyu works</h2>

        {/* The phone control. From `lg` the numbered headings take over. */}
        <div
          role="group"
          aria-label="Product steps"
          data-testid="workflow-tabs"
          className="mt-7 flex items-center gap-7 border-b border-line sm:gap-9 lg:hidden"
        >
          {STEPS.map((entry, index) => (
            <StepTab
              key={entry.number}
              number={entry.number}
              title={entry.title}
              selected={active === index}
              onSelect={() => setActive(index)}
            />
          ))}
        </div>

        <div
          className={cn(
            "mt-6 flex flex-col lg:mt-14",
            "lg:grid lg:grid-cols-[minmax(0,0.44fr)_minmax(0,0.56fr)] lg:items-start lg:gap-16",
          )}
        >
          {/*
           * Copy first on a phone, second column on a desktop. One list either
           * way; only its placement and how much of it shows changes.
           */}
          <ol className="order-1 min-w-0 lg:order-none lg:col-start-2 lg:row-start-1">
            {STEPS.map((entry, index) => {
              const isActive = active === index;
              return (
                <li
                  key={entry.number}
                  data-active={isActive}
                  aria-current={isActive ? "step" : undefined}
                  className={cn(
                    "fiyu-lp-step min-w-0",
                    "lg:flex lg:min-h-0 lg:flex-col lg:justify-center",
                    "lg:border-t lg:border-line lg:py-3 lg:first:border-t-0 lg:first:pt-0",
                  )}
                >
                  {/*
                   * A heading wrapping a button, not a heading inside one: a
                   * button may only contain phrasing content, and the previous
                   * version had an h3 inside it.
                   */}
                  <h3
                    className={cn(
                      "min-w-0 font-display leading-[1.15]",
                      "text-[1.375rem] sm:text-[1.5rem] lg:text-[1.875rem]",
                    )}
                  >
                    {isDesktop ? (
                      <button
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setActive(index)}
                        className="group flex w-full items-baseline gap-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lavender-500"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "font-display text-[2.25rem] leading-none transition-colors duration-500 ease-(--ease-fiyu)",
                            isActive
                              ? "text-lavender-700"
                              : "text-ink-faint/60 group-hover:text-ink-muted",
                          )}
                        >
                          {entry.number}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 transition-colors duration-500 ease-(--ease-fiyu)",
                            isActive
                              ? "text-ink"
                              : "text-ink-muted decoration-rose-dust decoration-1 underline-offset-[6px] group-hover:text-ink group-hover:underline",
                          )}
                        >
                          {entry.title}
                        </span>
                      </button>
                    ) : (
                      <span className="text-ink">{entry.title}</span>
                    )}
                  </h3>
                  <p className="mt-2.5 max-w-[26rem] text-[0.9375rem] leading-6 text-ink-body lg:mt-4 lg:leading-7">
                    {entry.copy}
                  </p>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-5 hidden h-px origin-left bg-lavender-500 transition-transform duration-[600ms] ease-(--ease-fiyu) lg:block",
                      isActive ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                </li>
              );
            })}
          </ol>

          {/*
           * The surface. Two hairlines and the picks' own white rather than a
           * rounded container: the heavy card read as a dashboard dropped into an
           * editorial page, and here the content defines the surface.
           */}
          <div
            aria-hidden="true"
            data-testid="workflow-surface"
            data-step={active}
            className={cn(
              "fiyu-lp-rise order-2 mt-7 flex h-[22.5rem] min-w-0 flex-col",
              "lg:order-none lg:col-start-1 lg:row-start-1 lg:mt-0 lg:h-[28rem]",
            )}
            data-in={flag}
          >
            <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-ink-faint uppercase">
              {PANEL_LABEL}
            </p>
            <div className="relative mt-3 min-h-0 flex-1 overflow-hidden border-y border-line">
              {/*
                The plate bleeds to the well's hairlines on purpose: it is the
                surface, not a picture resting on it. `slice` inside the SVG means
                a panel of any proportion crops the artwork rather than stretching
                it, and everything legible sits inside a safe band that survives
                every ratio between a phone and a desktop.
              */}
              <div className={cn(LAYER, active === 0 ? "opacity-100" : "opacity-0")}>
                <WorkflowLocationPlate />
              </div>
              <div className={cn(LAYER, "py-3 lg:py-4", active === 1 ? "opacity-100" : "opacity-0")}>
                <PicksSurface />
              </div>
              <div className={cn(LAYER, "py-3 lg:py-4", active === 2 ? "opacity-100" : "opacity-0")}>
                <SavedSurface />
              </div>
            </div>
            <IllustrativeNote className="mt-3">Illustrative discoveries</IllustrativeNote>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import {
  RESTAURANT_MOMENT_EXAMPLE,
  scoreMarkValue,
} from "@/components/landing-page/fictionalRestaurantExamples";
import {
  LANDING_MEASURE,
  LANDING_RHYTHM,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { IllustrativeNote } from "@/components/landing-page/ExamplePickCard";
import { useEntered } from "@/components/landing-page/motion/scrollScene";
import { SlotImage } from "@/components/landing-page/SlotImage";
import { TagList } from "@/components/restaurant/TagList";
import { formatFiyuScore, scoreAccessibleLabel } from "@/lib/format/score";
import { cn } from "@/lib/utils/cn";

/**
 * The restaurant, then the discovery.
 *
 * Restructured for the photograph that is coming rather than around the drawing
 * standing in for it. The image is now the dominant left column at a fixed 4:3,
 * and the right column is a short editorial annotation instead of a
 * metadata table: what the place is, where it is, and Fiyu's own reading of it.
 *
 * The visible line "Illustration. In the application, cards carry photographs
 * from Google Maps." is gone. It was an implementation note that had escaped onto
 * a marketing page -- true, and none of a visitor's business.
 *
 * The restaurant is invented, and the eyebrow says so: SAMPLE FIYU DISCOVERY,
 * not A FIYU DISCOVERY. Printing real underexposed restaurants on a public page
 * works against the product, so the page demonstrates the shape of a discovery
 * without giving one away.
 *
 * Seoul rather than Tokyo, on purpose. The rollout section remains the only
 * statement of where Fiyu actually operates; this is the first of several quiet
 * signals that the system is not Tokyo-shaped.
 *
 * The score band that used to sit beside the numeral is gone. A band is a
 * recorded judgement about a real restaurant, and Fiyu has not judged one that
 * does not exist. The invented score stays, because the score mark is the
 * product, but the eyebrow makes clear whose score it is.
 *
 * A fixed aspect box means a real photograph drops in with no structural change
 * and no layout shift.
 */

const example = RESTAURANT_MOMENT_EXAMPLE;
const SLOT = "restaurant_story_01";
const markScore = scoreMarkValue(example.displayScore);

export function RestaurantMoment() {
  const { ref, entered } = useEntered<HTMLElement>("0px 0px -20% 0px");
  const flag = entered ? "true" : "false";

  return (
    <section id="worth-finding" ref={ref} className="scroll-mt-24 border-b border-line bg-canvas">
      <div className={cn(LANDING_MEASURE, LANDING_RHYTHM)}>
        <h2
          className="fiyu-lp-rise max-w-[24ch] font-display text-[clamp(1.75rem,5vw,4rem)] leading-[0.98] tracking-[-0.02em] text-ink"
          data-in={flag}
        >
          Worth finding isn’t always easy to find.
        </h2>

        <div className="mt-8 grid gap-x-14 gap-y-7 lg:mt-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end">
          {/*
           * The emotional focus, and the reason the section exists. Fixed aspect,
           * so the photograph that replaces the drawing changes nothing else.
           */}
          <div
            className="fiyu-lp-plate relative aspect-[4/3] min-w-0 overflow-hidden rounded-card border border-line"
            data-in={flag}
            style={{ "--plate-delay": "120ms" } as React.CSSProperties}
          >
            <div className="fiyu-lp-plate-image size-full" data-in={flag}>
              <SlotImage
                slot={SLOT}
                sizes="(max-width: 1023px) calc(100vw - 2.5rem), 58vw"
              />
            </div>
          </div>

          {/* The annotation. Short, ruled, and every value is published data. */}
          <div
            className="fiyu-lp-rise min-w-0 lg:pb-2"
            data-in={flag}
            style={{ "--rise-delay": "260ms" } as React.CSSProperties}
          >
            <SectionEyebrow>Sample Fiyu discovery</SectionEyebrow>
            <p className="mt-5 font-display text-[clamp(1.625rem,2.8vw,2.5rem)] leading-[1.15] text-ink">
              {example.name}
            </p>

            <dl className="mt-7 border-t border-line pt-4">
              <dt className="sr-only">Area</dt>
              <dd className="font-display text-lg leading-tight text-ink">
                {example.area}, {example.city}
              </dd>
              <dt className="sr-only">Category</dt>
              <dd className="mt-1.5 text-sm text-ink-muted">{example.category}</dd>
            </dl>

            <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-t border-line pt-4">
              <p className="text-[0.625rem] font-semibold tracking-[0.18em] text-lavender-700 uppercase">
                Fiyu Score
              </p>
              <p
                role="img"
                aria-label={scoreAccessibleLabel(markScore)}
                className="font-display text-[2.25rem] leading-none tabular-nums text-plum"
              >
                {formatFiyuScore(markScore)}
              </p>
            </div>

            <TagList tags={[...example.tags]} max={3} className="mt-6" />
            <IllustrativeNote className="mt-6">Illustrative example</IllustrativeNote>
          </div>
        </div>
      </div>
    </section>
  );
}

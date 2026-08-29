"use client";

import { RESTAURANT_MOMENT_EXAMPLE } from "@/components/landing-page/landingExamples";
import {
  LANDING_MEASURE,
  LANDING_RHYTHM,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { useEntered } from "@/components/landing-page/motion/scrollScene";
import { SlotImage } from "@/components/landing-page/SlotImage";
import { TagList } from "@/components/restaurant/TagList";
import { formatFiyuScore, scoreAccessibleLabel, scoreBandLabel } from "@/lib/format/score";
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
 * Every value in the annotation is published catalog data. The band travels with
 * the example as its stored `score_band` and is rendered through the
 * application's own `scoreBandLabel`, so "Exceptional" here is Fiyu's recorded
 * judgement rather than a word chosen for this page. The three underexposure
 * signals were considered for this block and left out: they are the criteria Fiyu
 * screens on, not a per-restaurant finding, and asserting them about one named
 * place would be fabricating analysis.
 *
 * A fixed aspect box means a real photograph drops in with no structural change
 * and no layout shift.
 */

const example = RESTAURANT_MOMENT_EXAMPLE;
const SLOT = "restaurant_story_01";
const band = scoreBandLabel(example.scoreBand);

export function RestaurantMoment() {
  const { ref, entered } = useEntered<HTMLElement>("0px 0px -20% 0px");
  const flag = entered ? "true" : "false";

  return (
    <section id="worth-finding" ref={ref} className="scroll-mt-24 border-b border-line bg-canvas">
      <div className={cn(LANDING_MEASURE, LANDING_RHYTHM)}>
        <h2
          className="fiyu-lp-rise max-w-[24ch] font-display text-[clamp(1.875rem,5vw,4rem)] leading-[0.98] tracking-[-0.02em] text-ink"
          data-in={flag}
        >
          Worth finding isn’t always easy to find.
        </h2>

        <div className="mt-10 grid gap-x-14 gap-y-8 lg:mt-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end">
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
            <SectionEyebrow>A Fiyu discovery</SectionEyebrow>
            <p
              lang="ja"
              className="mt-5 font-display text-[clamp(1.625rem,2.8vw,2.5rem)] leading-[1.15] text-ink"
            >
              {example.nameJa}
            </p>
            <p className="mt-2 text-sm text-ink-muted">{example.nameEn}</p>

            <dl className="mt-7 border-t border-line pt-4">
              <dt className="sr-only">Area</dt>
              <dd className="font-display text-lg leading-tight text-ink">{example.area}</dd>
              <dt className="sr-only">Category</dt>
              <dd className="mt-1.5 text-sm text-ink-muted">{example.category}</dd>
            </dl>

            <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-t border-line pt-4">
              <p className="text-[0.625rem] font-semibold tracking-[0.18em] text-lavender-700 uppercase">
                Fiyu Score
              </p>
              <p
                role="img"
                aria-label={scoreAccessibleLabel(example.score)}
                className="font-display text-[2.25rem] leading-none tabular-nums text-plum"
              >
                {formatFiyuScore(example.score)}
              </p>
              {band && (
                <p className="text-[0.6875rem] tracking-[0.14em] text-gold-700 uppercase">{band}</p>
              )}
            </div>

            <TagList tags={[...example.tags]} max={3} className="mt-6" />
          </div>
        </div>
      </div>
    </section>
  );
}

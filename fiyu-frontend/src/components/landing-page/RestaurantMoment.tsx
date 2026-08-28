"use client";

import { RESTAURANT_MOMENT_EXAMPLE } from "@/components/landing-page/landingExamples";
import { LANDING_MEASURE, SectionEyebrow } from "@/components/landing-page/landingSystem";
import { useEntered } from "@/components/landing-page/motion/scrollScene";
import { SlotImage, slotIsIllustrated } from "@/components/landing-page/SlotImage";
import { TagList } from "@/components/restaurant/TagList";
import { ScoreMark } from "@/components/ui/ScoreMark";
import { cn } from "@/lib/utils/cn";

/**
 * The restaurant, then the discovery.
 *
 * This was a scroll-scrubbed crop: the plate opened edge to edge and closed into
 * a centred poster as the section passed. Two things were wrong with it. The
 * scrub was in "through" space, so the plate was always already half closed by
 * the time it was on screen and finished closing after it had left -- and the
 * effect was expensive, over a viewport and a half of scrolling, for a change no
 * reader could actually follow.
 *
 * It is now a single entrance: the plate unveils from its lower edge and settles
 * out of a four percent scale, once, when the section arrives. Under a second,
 * over before a reader has finished reading the headline, and there is no
 * intermediate state to be caught in. The record follows on a stagger.
 *
 * The image is a declared slot. Until a photograph exists it shows the line
 * drawing Fiyu owns, and says so in visible copy -- and that caption disappears
 * by itself the moment the slot has a real photograph in it.
 */

const example = RESTAURANT_MOMENT_EXAMPLE;
const SLOT = "restaurant_story_01";

const RECORD = [
  { label: "Category", value: example.category },
  { label: "Area", value: example.area },
] as const;

export function RestaurantMoment() {
  const { ref, entered } = useEntered<HTMLElement>("0px 0px -25% 0px");
  const flag = entered ? "true" : "false";
  const illustrated = slotIsIllustrated(SLOT);

  return (
    <section
      id="worth-finding"
      ref={ref}
      className="scroll-mt-24 border-b border-line bg-canvas"
    >
      {/*
       * A bounded band rather than a viewport: the plate is generous without
       * costing a screen of scrolling, and its height is set here rather than by
       * the image, so nothing shifts when a real photograph replaces the drawing.
       */}
      <div
        className="fiyu-lp-plate relative h-[38svh] overflow-hidden sm:h-[54svh] lg:h-[58svh]"
        data-in={flag}
      >
        <div className="fiyu-lp-plate-image relative size-full" data-in={flag}>
          <SlotImage slot={SLOT} sizes="100vw" />
        </div>
      </div>

      <div
        className={cn(
          LANDING_MEASURE,
          "grid gap-x-16 gap-y-10 py-14 sm:py-16",
          "lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:py-20",
        )}
      >
        <div className="min-w-0">
          <h2
            className="fiyu-lp-rise max-w-[22ch] font-display text-[clamp(1.875rem,5.4vw,4.25rem)] leading-[0.98] tracking-[-0.02em] text-ink"
            data-in={flag}
            style={{ "--rise-delay": "180ms" } as React.CSSProperties}
          >
            Worth finding isn’t always easy to find.
          </h2>
          {illustrated && (
            <p className="mt-6 max-w-[24rem] text-[0.6875rem] leading-5 text-ink-faint">
              Illustration. In the application, cards carry photographs from Google Maps.
            </p>
          )}
        </div>

        <div className="min-w-0">
          <div
            className="fiyu-lp-rise"
            data-in={flag}
            style={{ "--rise-delay": "320ms" } as React.CSSProperties}
          >
            <SectionEyebrow>A Fiyu discovery</SectionEyebrow>
            <p
              lang="ja"
              className="mt-4 font-display text-[clamp(1.5rem,2.6vw,2.25rem)] leading-[1.2] text-ink"
            >
              {example.nameJa}
            </p>
            <p className="mt-1.5 text-sm text-ink-muted">{example.nameEn}</p>
          </div>

          <dl className="mt-6 min-w-0">
            {RECORD.map((row, index) => (
              <div
                key={row.label}
                className="fiyu-lp-rise flex min-w-0 items-baseline justify-between gap-6 border-t border-line py-3"
                data-in={flag}
                style={
                  {
                    "--rise-delay": 420 + index * 110 + "ms",
                    "--rise-from": "10px",
                  } as React.CSSProperties
                }
              >
                <dt className="shrink-0 text-[0.625rem] tracking-[0.16em] text-ink-faint uppercase">
                  {row.label}
                </dt>
                <dd className="min-w-0 truncate text-sm text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>

          <div
            className="fiyu-lp-rise mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-5"
            data-in={flag}
            style={{ "--rise-delay": "640ms", "--rise-from": "10px" } as React.CSSProperties}
          >
            <TagList tags={[...example.tags]} max={3} className="min-w-0" />
            <ScoreMark score={example.score} size="md" className="shrink-0" />
          </div>
        </div>
      </div>
    </section>
  );
}

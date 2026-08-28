"use client";

import Image from "next/image";

import { RESTAURANT_MOMENT_EXAMPLE } from "@/components/landing-page/landingExamples";
import { LANDING_MEASURE, SectionEyebrow } from "@/components/landing-page/landingSystem";
import { useScrollScene } from "@/components/landing-page/motion/scrollScene";
import { TagList } from "@/components/restaurant/TagList";
import { ScoreMark } from "@/components/ui/ScoreMark";
import { cn } from "@/lib/utils/cn";

/**
 * The restaurant, then the discovery.
 *
 * The first of the page's scroll-led sequences, and the one that puts a
 * restaurant on screen at full width before Fiyu explains anything about
 * itself. The plate arrives edge to edge and closes into a centred poster as the
 * section rises; the record resolves underneath it -- name, category,
 * neighbourhood, tags, score. Restaurant first, discovered through Fiyu second.
 *
 * Nothing is pinned and nothing is stacked on top of anything else. The plate
 * has a bounded height and the type sits beneath it in normal flow, which is
 * what makes the section safe on a short phone: there is no height budget to
 * blow, so a 5.4-inch screen shows a smaller band and the same words, rather
 * than a headline sitting on a photograph.
 *
 * The crop is `clip-path`, never width, so the plate closes without the section
 * reflowing once. At the CSS default of `--scene-progress: 1` a reader with
 * motion off gets the closed poster and the whole record.
 *
 * The plate is captioned as an illustration, in plain sight. Fiyu has no
 * photographic library; the application draws card photos from Google Maps at
 * request time, one billed call each, which is not a cost a public page hit by
 * anonymous traffic should carry. Saying so is better than implying the drawing
 * is a photograph of this restaurant.
 */

const example = RESTAURANT_MOMENT_EXAMPLE;

const RECORD = [
  { label: "Category", value: example.category },
  { label: "Neighbourhood", value: example.neighborhood },
] as const;

/**
 * Edge to edge, closing to a centred poster. The crop finishes at just past
 * half the pass, which is roughly when the section fills the viewport.
 */
const CROP =
  "[--crop-bottom:5%] [--crop-from:0.16] [--crop-left:5%] [--crop-right:5%] " +
  "[--crop-span:0.34] [--crop-top:4%] " +
  "sm:[--crop-bottom:8%] sm:[--crop-left:21%] sm:[--crop-right:21%] sm:[--crop-top:8%]";

export function RestaurantMoment() {
  const { ref } = useScrollScene<HTMLDivElement>({ mode: "through" });

  return (
    <section id="worth-finding" className="scroll-mt-24 border-b border-line bg-canvas">
      <div ref={ref} className="fiyu-lp-scene">
        <div className={cn("relative h-[42svh] overflow-hidden sm:h-[74svh]", CROP, "fiyu-lp-crop")}>
          <div className="fiyu-lp-crop-image relative size-full">
            <Image
              src="/images/about-storefront.png"
              alt="A line illustration of a small independent restaurant counter, drawn for Fiyu"
              fill
              sizes="100vw"
              className="object-cover object-center"
            />
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
            <h2 className="max-w-[22ch] font-display text-[clamp(1.875rem,5.4vw,4.25rem)] leading-[0.98] tracking-[-0.02em] text-ink">
              Worth finding isn’t always easy to find.
            </h2>
            <p className="mt-6 max-w-[24rem] text-[0.6875rem] leading-5 text-ink-faint">
              Illustration. In the application, cards carry photographs from Google Maps.
            </p>
          </div>

          {/* The record, resolving as the plate closes. */}
          <div className="min-w-0">
            <div className="fiyu-lp-stage-item [--from:0.34] [--span:0.18] [--stage-y:18px]">
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
                  className={cn(
                    "fiyu-lp-stage-item flex min-w-0 items-baseline justify-between gap-6",
                    "border-t border-line py-3 [--span:0.14] [--stage-y:12px]",
                  )}
                  style={{ "--from": String(0.46 + index * 0.07) } as React.CSSProperties}
                >
                  <dt className="shrink-0 text-[0.625rem] tracking-[0.16em] text-ink-faint uppercase">
                    {row.label}
                  </dt>
                  <dd className="min-w-0 truncate text-sm text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>

            <div className="fiyu-lp-stage-item mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-5 [--from:0.6] [--span:0.16] [--stage-y:12px]">
              <TagList tags={[...example.tags]} max={3} className="min-w-0" />
              <ScoreMark score={example.score} size="md" className="shrink-0" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

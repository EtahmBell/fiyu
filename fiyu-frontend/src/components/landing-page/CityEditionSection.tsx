"use client";

import Link from "next/link";

import { usePicksEntryHref } from "@/components/landing-page/AuthAwarePicksLink";
import { LANDING_MEASURE } from "@/components/landing-page/landingSystem";
import { useEntered } from "@/components/landing-page/motion/scrollScene";
import { SlotImage } from "@/components/landing-page/SlotImage";
import { CityHeaderMark } from "@/components/city-signature/CitySignature";
import type { ImageSlotId } from "@/components/landing-page/imageSlots";
import type { CityId } from "@/lib/city/editions";
import { cn } from "@/lib/utils/cn";

/**
 * A city edition.
 *
 * The dark plum break is kept -- it is the strongest change of key on the page --
 * but it was doing far too much of it. The artwork ran full bleed at its natural
 * three-to-one ratio, which is nearly five hundred pixels tall at desktop width,
 * on top of a full copy block and a standing footer: over a viewport and a
 * quarter, which made Tokyo the largest thing on a page about a global product.
 *
 * Reduced twice and still reading as the page's largest section, so this pass
 * changes its shape rather than trimming it again. Two columns of stacked copy
 * beside a tall image is a *feature block*; three short columns under one hairline
 * and above another is a *band*, and a band is what a current-city note should
 * be. The city and its line sit in the first column, the description and the
 * action in the second, the plate in the third, and the row is only as tall as the
 * tallest of the three -- roughly 310px at desktop against about 540px before.
 *
 * Tokyo reads as an issue of a series rather than as the subject.
 *
 * Everything is driven by an `edition` object, so New York is a second constant,
 * not a second component -- including its photography, which is its own slot
 * rather than a re-crop of Tokyo's.
 */

export interface CityEdition {
  cityId: CityId;
  cityName: string;
  editionLabel: string;
  heading: string;
  description: string;
  slot: ImageSlotId;
  /** The standing line under the plate. Null once nothing is scheduled. */
  nextUp: { city: string; when: string } | null;
}

const TOKYO_EDITION: CityEdition = {
  cityId: "tokyo",
  cityName: "Tokyo",
  editionLabel: "Edition 01",
  heading: "Fiyu has arrived in Tokyo.",
  description:
    "Explore Tokyo’s independent and underexposed restaurants, selected around your tastes—from local izakayas to tucked-away ramen counters you might otherwise miss.",
  slot: "current_edition_tokyo",
  nextUp: { city: "New York", when: "October 2026" },
};

export function CityEditionSection({ edition = TOKYO_EDITION }: { edition?: CityEdition }) {
  const picksHref = usePicksEntryHref();
  const { ref, entered } = useEntered<HTMLElement>({ threshold: 0.15 });
  const flag = entered ? "true" : "false";

  return (
    <section
      id="city-edition"
      ref={ref}
      className="scroll-mt-24 overflow-hidden bg-plum text-white"
    >
      <div className={cn(LANDING_MEASURE, "py-9 sm:py-11")}>
        <div
          className="fiyu-lp-rise flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-3"
          data-in={flag}
        >
          <div className="flex items-center gap-3">
            <CityHeaderMark cityId={edition.cityId} className="size-5 text-lavender-100" />
            <p className="text-[0.6875rem] font-semibold tracking-[0.2em] text-lavender-100 uppercase">
              Currently exploring
            </p>
          </div>
          <p className="text-[0.6875rem] font-semibold tracking-[0.2em] text-white/45 uppercase">
            {edition.editionLabel}
          </p>
        </div>

        <div className="mt-6 grid gap-x-12 gap-y-6 sm:mt-7 sm:gap-y-7 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.05fr)_minmax(0,1.05fr)] lg:items-center">
          <div className="min-w-0">
            <p
              aria-hidden="true"
              className="fiyu-lp-rise font-display text-[clamp(2.25rem,4.4vw,3.5rem)] leading-[0.85] tracking-[-0.04em] text-white"
              data-in={flag}
              style={{ "--rise-delay": "80ms" } as React.CSSProperties}
            >
              {edition.cityName}
            </p>
            <h2
              className="fiyu-lp-rise mt-3 max-w-[20ch] font-display text-[clamp(1.125rem,1.5vw,1.375rem)] leading-[1.2] text-white"
              data-in={flag}
              style={{ "--rise-delay": "140ms" } as React.CSSProperties}
            >
              {edition.heading}
            </h2>
          </div>

          <div
            className="fiyu-lp-rise min-w-0"
            data-in={flag}
            style={{ "--rise-delay": "200ms" } as React.CSSProperties}
          >
            <p className="text-[0.875rem] leading-6 text-white/75">{edition.description}</p>
            <Link
              href={picksHref}
              className="mt-5 inline-flex min-h-11 w-fit items-center rounded-chip bg-white px-6 text-sm font-medium text-plum transition-colors duration-200 ease-(--ease-fiyu) hover:bg-lavender-100"
            >
              Explore {edition.cityName}
            </Link>
          </div>

          {/*
           * A short wide crop, sized here rather than by its column: an aspect box
           * takes its height from the grid, which is how this plate twice ended up
           * deciding the height of the whole section.
           */}
          <figure
            data-testid="city-edition-plate"
            className="fiyu-lp-plate relative h-[9rem] min-w-0 overflow-hidden rounded-card border border-white/15 bg-canvas sm:h-[10rem] lg:h-[8.5rem]"
            data-in={flag}
            style={{ "--plate-delay": "240ms" } as React.CSSProperties}
          >
            <div className="fiyu-lp-breathe relative size-full">
              <SlotImage
                slot={edition.slot}
                sizes="(max-width: 1023px) calc(100vw - 2.5rem), 34vw"
              />
            </div>
          </figure>
        </div>

        {edition.nextUp && (
          <dl
            className="fiyu-lp-rise mt-6 flex flex-wrap items-baseline gap-x-5 gap-y-2 border-t border-white/15 pt-4 sm:mt-7"
            data-in={flag}
            style={{ "--rise-delay": "360ms" } as React.CSSProperties}
          >
            <dt className="text-[0.6875rem] font-semibold tracking-[0.2em] text-white/45 uppercase">
              Next edition
            </dt>
            <dd className="font-display text-lg leading-none text-white">
              {edition.nextUp.city}
            </dd>
            <dd className="text-[0.6875rem] tracking-[0.14em] text-lavender-100 uppercase">
              {edition.nextUp.when}
            </dd>
          </dl>
        )}
      </div>
    </section>
  );
}

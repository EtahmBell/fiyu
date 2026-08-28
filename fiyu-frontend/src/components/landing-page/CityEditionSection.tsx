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
 * It was reduced once and was still the tallest thing on the page, because the
 * plate was sized by its column: a 3:2 box in a 730px column is 490px tall on its
 * own, and it set the height of the whole row. The plate now has a bounded height
 * of its own and crops to fill, which decouples it from the layout entirely --
 * every other cut is padding and type scale. About 900px down to about 580px at
 * desktop, a reduction of roughly a third, and the composition now sits inside
 * one viewport with room left over.
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
  slot: "current_city_01",
  nextUp: { city: "New York", when: "October 2026" },
};

export function CityEditionSection({ edition = TOKYO_EDITION }: { edition?: CityEdition }) {
  const picksHref = usePicksEntryHref();
  const { ref, entered } = useEntered<HTMLElement>();
  const flag = entered ? "true" : "false";

  return (
    <section
      id="city-edition"
      ref={ref}
      className="scroll-mt-24 overflow-hidden bg-plum text-white"
    >
      <div className={cn(LANDING_MEASURE, "py-12 sm:py-14")}>
        <div
          className="fiyu-lp-rise flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-4"
          data-in={flag}
        >
          <div className="flex items-center gap-3">
            <CityHeaderMark cityId={edition.cityId} className="size-6 text-lavender-100" />
            <p className="text-[0.6875rem] font-semibold tracking-[0.2em] text-lavender-100 uppercase">
              Currently exploring
            </p>
          </div>
          <p className="text-[0.6875rem] font-semibold tracking-[0.2em] text-white/45 uppercase">
            {edition.editionLabel}
          </p>
        </div>

        <div className="mt-8 grid gap-x-14 gap-y-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <div className="min-w-0">
            <p
              aria-hidden="true"
              className="fiyu-lp-rise font-display text-[clamp(2.75rem,6vw,4.5rem)] leading-[0.85] tracking-[-0.04em] text-white"
              data-in={flag}
              style={{ "--rise-delay": "80ms" } as React.CSSProperties}
            >
              {edition.cityName}
            </p>
            <h2
              className="fiyu-lp-rise mt-4 max-w-[22ch] font-display text-[clamp(1.25rem,1.8vw,1.75rem)] leading-[1.15] text-white"
              data-in={flag}
              style={{ "--rise-delay": "140ms" } as React.CSSProperties}
            >
              {edition.heading}
            </h2>
            <p
              className="fiyu-lp-rise mt-4 max-w-[36rem] text-[0.9375rem] leading-7 text-white/75"
              data-in={flag}
              style={{ "--rise-delay": "220ms" } as React.CSSProperties}
            >
              {edition.description}
            </p>
            <Link
              href={picksHref}
              className="fiyu-lp-rise mt-6 inline-flex min-h-12 w-fit items-center rounded-chip bg-white px-7 text-sm font-medium text-plum transition-colors duration-200 ease-(--ease-fiyu) hover:bg-lavender-100"
              data-in={flag}
              style={{ "--rise-delay": "300ms" } as React.CSSProperties}
            >
              Explore {edition.cityName}
            </Link>
          </div>

          {/*
           * A bounded *height*, not an aspect ratio. An aspect box takes its
           * height from the column, which is how this plate ended up nearly 500px
           * tall and set the height of the entire section. A fixed height crops to
           * fill instead, so the section's height is decided here and a real
           * photograph drops in without moving anything.
           */}
          <figure
            data-testid="city-edition-plate"
            className="fiyu-lp-plate relative h-[13rem] min-w-0 overflow-hidden rounded-card border border-white/15 bg-canvas sm:h-[15rem] lg:h-[17rem]"
            data-in={flag}
            style={{ "--plate-delay": "240ms" } as React.CSSProperties}
          >
            <div className="fiyu-lp-breathe relative size-full">
              <SlotImage
                slot={edition.slot}
                sizes="(max-width: 1023px) calc(100vw - 2.5rem), 50vw"
              />
            </div>
          </figure>
        </div>

        {edition.nextUp && (
          <dl
            className="fiyu-lp-rise mt-8 flex flex-wrap items-baseline gap-x-5 gap-y-2 border-t border-white/15 pt-5"
            data-in={flag}
            style={{ "--rise-delay": "360ms" } as React.CSSProperties}
          >
            <dt className="text-[0.6875rem] font-semibold tracking-[0.2em] text-white/45 uppercase">
              Next edition
            </dt>
            <dd className="font-display text-xl leading-none text-white">
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

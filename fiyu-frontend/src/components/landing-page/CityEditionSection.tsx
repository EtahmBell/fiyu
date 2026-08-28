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
 * Now it is one viewport. The image sits in a bounded three-to-two box in the
 * second column rather than spanning the page, the plate and the copy share one
 * screen, and the next-edition line closes it on a hairline. Same idea, roughly
 * two thirds of the height, and Tokyo reads as an issue of a series instead of as
 * the subject.
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
      <div className={cn(LANDING_MEASURE, "py-16 sm:py-20 lg:py-24")}>
        <div
          className="fiyu-lp-rise flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-5"
          data-in={flag}
        >
          <div className="flex items-center gap-3">
            <CityHeaderMark cityId={edition.cityId} className="size-7 text-lavender-100" />
            <p className="text-[0.6875rem] font-semibold tracking-[0.2em] text-lavender-100 uppercase">
              Currently exploring
            </p>
          </div>
          <p className="text-[0.6875rem] font-semibold tracking-[0.2em] text-white/45 uppercase">
            {edition.editionLabel}
          </p>
        </div>

        <div className="mt-10 grid gap-x-14 gap-y-9 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:items-center">
          <div className="min-w-0">
            <p
              aria-hidden="true"
              className="fiyu-lp-rise font-display text-[clamp(3.25rem,8vw,6.5rem)] leading-[0.85] tracking-[-0.04em] text-white"
              data-in={flag}
              style={{ "--rise-delay": "80ms" } as React.CSSProperties}
            >
              {edition.cityName}
            </p>
            <h2
              className="fiyu-lp-rise mt-5 max-w-[20ch] font-display text-[clamp(1.375rem,2.1vw,2rem)] leading-[1.1] text-white"
              data-in={flag}
              style={{ "--rise-delay": "140ms" } as React.CSSProperties}
            >
              {edition.heading}
            </h2>
            <p
              className="fiyu-lp-rise mt-5 max-w-[32rem] text-[0.9375rem] leading-7 text-white/75 sm:text-base sm:leading-8"
              data-in={flag}
              style={{ "--rise-delay": "220ms" } as React.CSSProperties}
            >
              {edition.description}
            </p>
            <Link
              href={picksHref}
              className="fiyu-lp-rise mt-8 inline-flex min-h-12 w-fit items-center rounded-chip bg-white px-7 text-sm font-medium text-plum transition-colors duration-200 ease-(--ease-fiyu) hover:bg-lavender-100"
              data-in={flag}
              style={{ "--rise-delay": "300ms" } as React.CSSProperties}
            >
              Explore {edition.cityName}
            </Link>
          </div>

          {/*
           * A bounded box, a cream mat and a hairline. The plate is generous
           * without deciding the section's height, and swapping the drawing for a
           * photograph moves nothing.
           */}
          <figure
            data-testid="city-edition-plate"
            className="fiyu-lp-plate relative min-w-0 overflow-hidden rounded-card border border-white/15 bg-canvas"
            data-in={flag}
            style={{ "--plate-delay": "240ms" } as React.CSSProperties}
          >
            <div className="fiyu-lp-breathe relative aspect-[3/2]">
              <SlotImage
                slot={edition.slot}
                sizes="(max-width: 1023px) calc(100vw - 2.5rem), 54vw"
              />
            </div>
          </figure>
        </div>

        {edition.nextUp && (
          <dl
            className="fiyu-lp-rise mt-12 flex flex-wrap items-baseline gap-x-5 gap-y-2 border-t border-white/15 pt-6 lg:mt-14"
            data-in={flag}
            style={{ "--rise-delay": "360ms" } as React.CSSProperties}
          >
            <dt className="text-[0.6875rem] font-semibold tracking-[0.2em] text-white/45 uppercase">
              Next edition
            </dt>
            <dd className="font-display text-2xl leading-none text-white">
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

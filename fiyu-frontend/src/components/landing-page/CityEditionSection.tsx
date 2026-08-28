"use client";

import Image from "next/image";
import Link from "next/link";

import { usePicksEntryHref } from "@/components/landing-page/AuthAwarePicksLink";
import { LANDING_MEASURE } from "@/components/landing-page/landingSystem";
import { useEntered } from "@/components/landing-page/motion/scrollScene";
import { CityHeaderMark } from "@/components/city-signature/CitySignature";
import type { CityId } from "@/lib/city/editions";
import { cn } from "@/lib/utils/cn";

/**
 * A city edition.
 *
 * The dark plum section was the strongest visual departure on the old page and
 * it is kept, but reframed as one issue of a series rather than as a statement
 * about what Fiyu is. "Currently exploring / Edition 01", the city, and a
 * standing line naming the next edition: read together, Tokyo is chapter one.
 *
 * It is also where the Tokyo artwork belongs. The old poster was the Open Graph
 * sharing image pressed into service on the page; this is the wide plate the
 * application already uses for a Tokyo surface, and at full bleed on plum it
 * carries the section on its own.
 *
 * Everything below is driven by an `edition` object, so a New York edition is a
 * second constant, not a second component.
 */

export interface CityEdition {
  cityId: CityId;
  cityName: string;
  editionLabel: string;
  heading: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
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
  imageSrc: "/images/log-empty-table.png",
  imageAlt:
    "A line illustration looking out from a restaurant table onto a quiet Tokyo street",
  imageWidth: 2172,
  imageHeight: 724,
  nextUp: { city: "New York", when: "October 2026" },
};

export function CityEditionSection({ edition = TOKYO_EDITION }: { edition?: CityEdition }) {
  const picksHref = usePicksEntryHref();
  const { ref, entered } = useEntered<HTMLDivElement>();
  const flag = entered ? "true" : "false";

  return (
    <section
      id="city-edition"
      ref={ref}
      className="scroll-mt-24 overflow-hidden bg-plum text-white"
    >
      <div className={cn(LANDING_MEASURE, "pt-20 pb-14 sm:pt-24 lg:pt-28")}>
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

        <div className="mt-10 grid gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
          <div className="min-w-0">
            <p
              aria-hidden="true"
              className="fiyu-lp-rise font-display text-[clamp(3.5rem,9vw,7.5rem)] leading-[0.85] tracking-[-0.04em] text-white"
              data-in={flag}
              style={{ "--rise-delay": "80ms" } as React.CSSProperties}
            >
              {edition.cityName}
            </p>
            <h2
              className="fiyu-lp-rise mt-7 max-w-[20ch] font-display text-[clamp(1.5rem,2.4vw,2.25rem)] leading-[1.1] text-white"
              data-in={flag}
              style={{ "--rise-delay": "160ms" } as React.CSSProperties}
            >
              {edition.heading}
            </h2>
          </div>

          <div
            className="fiyu-lp-rise min-w-0"
            data-in={flag}
            style={{ "--rise-delay": "240ms" } as React.CSSProperties}
          >
            <p className="max-w-[34rem] text-base leading-8 text-white/75">
              {edition.description}
            </p>
            <Link
              href={picksHref}
              className="mt-8 inline-flex min-h-12 w-fit items-center rounded-chip bg-white px-7 text-sm font-medium text-plum transition-colors duration-200 ease-(--ease-fiyu) hover:bg-lavender-100"
            >
              Explore {edition.cityName}
            </Link>
          </div>
        </div>
      </div>

      {/*
       * Full bleed, with a cream mat and a hairline and nothing else. The plate
       * is the only large image on the page, so it needs room rather than
       * competing ornament.
       */}
      <figure
        data-testid="city-edition-plate"
        className="fiyu-lp-rise mt-2 overflow-hidden border-y border-white/15 bg-canvas"
        data-in={flag}
        style={{ "--rise-delay": "320ms", "--rise-from": "22px" } as React.CSSProperties}
      >
        <div className="fiyu-lp-breathe">
          <Image
            src={edition.imageSrc}
            alt={edition.imageAlt}
            width={edition.imageWidth}
            height={edition.imageHeight}
            loading="lazy"
            sizes="100vw"
            className="block h-auto w-full"
          />
        </div>
      </figure>

      {edition.nextUp && (
        <div className={cn(LANDING_MEASURE, "py-8")}>
          <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
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
        </div>
      )}
    </section>
  );
}

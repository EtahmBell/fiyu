import Image from "next/image";
import Link from "next/link";

import { CityHeaderMark } from "@/components/city-signature/CitySignature";
import {
  LANDING_HEADING,
  LANDING_MEASURE,
  LANDING_RHYTHM,
} from "@/components/landing-page/landingSystem";
import type { CityId } from "@/lib/city/editions";
import { cn } from "@/lib/utils/cn";

export type CityEditionPreviewModel = {
  cityId: CityId;
  cityName: string;
  imageSrc: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
  eyebrow: string;
  heading: string;
  description: string;
  destination: string;
};

export function CityEditionPreview({ edition }: { edition: CityEditionPreviewModel }) {
  return (
    <div
      className={cn(
        LANDING_MEASURE,
        LANDING_RHYTHM,
        "grid gap-x-16 gap-y-10",
        "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-rows-[auto_1fr] lg:items-center",
      )}
    >
      <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end">
        <div className="landing-tokyo-signature flex items-center gap-3">
          <CityHeaderMark cityId={edition.cityId} className="size-8 text-lavender-100" />
          <p className="text-[0.6875rem] font-semibold tracking-[0.2em] text-lavender-100 uppercase">
            {edition.eyebrow}
          </p>
        </div>
        <h2 className={cn(LANDING_HEADING, "mt-7 max-w-[15ch] text-white")}>{edition.heading}</h2>
        <p className="mt-7 max-w-[34rem] text-base leading-8 text-white/75">
          {edition.description}
        </p>
      </div>

      {/*
       * A cream mat and a hairline, nothing else. The poster is the only image
       * on the page, so it needs room rather than competing ornament, and the
       * previous drop shadow was doing the work of a product advertisement.
       */}
      <figure className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div className="overflow-hidden rounded-card border border-white/15 bg-canvas p-1.5 shadow-[0_28px_60px_-44px_rgba(0,0,0,0.6)] sm:p-2">
          <Image
            src={edition.imageSrc}
            alt={edition.imageAlt}
            width={edition.imageWidth}
            height={edition.imageHeight}
            loading="lazy"
            sizes="(max-width: 1023px) calc(100vw - 2.5rem), (max-width: 1439px) 50vw, 700px"
            className="block h-auto w-full rounded-[0.75rem]"
          />
        </div>
      </figure>

      <Link
        href={edition.destination}
        className="inline-flex min-h-12 w-fit items-center rounded-chip bg-white px-7 text-sm font-medium text-plum transition-colors duration-200 ease-(--ease-fiyu) hover:bg-lavender-100 lg:col-start-1 lg:row-start-2 lg:mt-2 lg:self-start"
      >
        Explore {edition.cityName}
      </Link>
    </div>
  );
}

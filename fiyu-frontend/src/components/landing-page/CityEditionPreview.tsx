import Image from "next/image";
import Link from "next/link";

import { CityHeaderMark } from "@/components/city-signature/CitySignature";
import type { CityId } from "@/lib/city/editions";

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
    <div className="mx-auto grid w-full max-w-[90rem] gap-x-12 gap-y-9 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:grid-rows-[auto_1fr] lg:items-center lg:px-12 lg:py-28">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end">
        <div className="landing-tokyo-signature flex items-center gap-3">
          <CityHeaderMark cityId={edition.cityId} className="size-9 text-lavender-100" />
          <p className="text-xs font-semibold tracking-[0.18em] text-lavender-100 uppercase">
            {edition.eyebrow}
          </p>
        </div>
        <h2 className="mt-7 max-w-xl font-display text-5xl leading-[0.92] sm:text-7xl">
          {edition.heading}
        </h2>
        <p className="mt-6 max-w-xl text-base leading-7 text-white/70">{edition.description}</p>
      </div>

      <figure className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div className="overflow-hidden rounded-card border border-white/20 bg-[#f5efe5] p-1 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.7)] sm:p-1.5">
          <Image
            src={edition.imageSrc}
            alt={edition.imageAlt}
            width={edition.imageWidth}
            height={edition.imageHeight}
            loading="lazy"
            sizes="(max-width: 1023px) calc(100vw - 2.5rem), (max-width: 1439px) 53vw, 760px"
            className="block h-auto w-full rounded-[0.9rem]"
          />
        </div>
      </figure>

      <Link
        href={edition.destination}
        className="inline-flex min-h-12 w-fit items-center rounded-chip bg-white px-7 text-sm font-medium text-plum transition-colors hover:bg-lavender-100 lg:col-start-1 lg:row-start-2 lg:self-start"
      >
        Explore {edition.cityName}
      </Link>
    </div>
  );
}

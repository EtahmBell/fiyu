"use client";

import Link from "next/link";

import { AuthAwarePicksLink } from "@/components/landing-page/AuthAwarePicksLink";
import { TOKYO_AREAS } from "@/components/landing-page/landingAreas";
import { LANDING_MEASURE } from "@/components/landing-page/landingSystem";
import { useEntered } from "@/components/landing-page/motion/scrollScene";
import { cn } from "@/lib/utils/cn";

/**
 * The closing beat.
 *
 * This used to be the hero composition again -- the same lavender plate, the same
 * three overlapping cards, the same reveal -- which meant the page ended by
 * repeating its own opening instead of resolving it. By that point a reader has
 * already seen that object twice.
 *
 * So the ending is type and a colophon: the line, the action, and then the
 * coverage.
 *
 * The colophon used to list eight restaurant names, which was an arbitrary
 * sample -- eight of the catalog, chosen by me, saying nothing about how much of
 * the city Fiyu actually knows. It now lists the areas instead, derived from the
 * product's own map labels and checked against the backend's Tokyo service
 * boundary. Thirty-nine names is a statement about breadth; eight restaurants was
 * a statement about nothing.
 *
 * No cards, no map, no photography. Every other section has a visual; this one
 * deliberately does not, because a landing page should end on its offer rather
 * than on another picture.
 *
 * Motion is one staggered entrance and nothing else.
 */
export function FinalCta() {
  const { ref, entered } = useEntered<HTMLElement>();
  const flag = entered ? "true" : "false";

  return (
    <section id="start" ref={ref} className="scroll-mt-24 border-b border-line bg-canvas">
      <div className={cn(LANDING_MEASURE, "pt-14 pb-10 sm:pt-20 sm:pb-14 lg:pt-28")}>
        <div className="grid gap-x-16 gap-y-8 sm:gap-y-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end">
          <div className="min-w-0">
            <h2
              className="fiyu-lp-rise max-w-[16ch] font-display text-[clamp(2.125rem,6vw,5.25rem)] leading-[0.94] tracking-[-0.03em] text-ink"
              data-in={flag}
            >
              Your next few are waiting.
            </h2>
            <span
              aria-hidden="true"
              className="fiyu-lp-rule mt-8 block h-px w-16 origin-left bg-rose-dust"
              data-in={flag}
              style={{ "--rule-delay": "260ms" } as React.CSSProperties}
            />
          </div>

          <div
            className="fiyu-lp-rise min-w-0 lg:pb-2"
            data-in={flag}
            style={{ "--rise-delay": "160ms" } as React.CSSProperties}
          >
            <p className="max-w-[28rem] text-base leading-8 text-ink-muted">
              Tokyo is open now. Tell Fiyu what you like, and a small selection of independent
              places will be there when you look.
            </p>
            <div className="mt-8 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-7">
              <AuthAwarePicksLink className="inline-flex min-h-12 items-center rounded-chip bg-plum px-7 text-sm font-medium text-white transition-colors duration-200 ease-(--ease-fiyu) hover:bg-lavender-700">
                Explore Tokyo
              </AuthAwarePicksLink>
              <Link
                href="/about"
                className="text-sm font-medium text-lavender-700 underline decoration-lavender-100 decoration-2 underline-offset-4 transition-colors duration-200 ease-(--ease-fiyu) hover:decoration-lavender-500"
              >
                Read about Fiyu
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/*
       * The colophon. A ruled grid of areas, sized to fit all of them rather than
       * truncated: the length is the point. Row-major over a prominence-ordered
       * list, so it opens on the names a visitor will already know.
       */}
      <div className={cn(LANDING_MEASURE, "border-t border-line py-8 sm:py-10")}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <p className="text-[0.625rem] font-semibold tracking-[0.18em] text-ink-faint uppercase">
            In Tokyo now
          </p>
          <p className="text-[0.6875rem] leading-5 text-ink-faint">
            Fiyu&apos;s Tokyo edition spans these areas.
          </p>
        </div>
        <ul
          data-testid="coverage-areas"
          className="mt-5 grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-4 sm:gap-x-6 sm:gap-y-2.5 lg:grid-cols-6"
        >
          {TOKYO_AREAS.map((area, index) => (
            <li
              key={area}
              className="fiyu-lp-rise min-w-0 truncate text-xs leading-5 text-ink sm:text-[0.8125rem]"
              data-in={flag}
              style={
                {
                  "--rise-delay": 260 + Math.min(index, 18) * 22 + "ms",
                  "--rise-duration": "460ms",
                  "--rise-from": "6px",
                } as React.CSSProperties
              }
            >
              {area}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

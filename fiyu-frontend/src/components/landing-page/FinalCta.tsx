"use client";

import Link from "next/link";

import { AuthAwarePicksLink } from "@/components/landing-page/AuthAwarePicksLink";
import { ALL_EXAMPLES } from "@/components/landing-page/landingExamples";
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
 * So the ending is type and a colophon. The line, the action, and then every
 * place Fiyu has published in Tokyo listed as a single ruled index across the
 * foot of the page. It is the one moment where the whole set is visible at once,
 * which is the right last word for a product whose argument is that it only ever
 * shows you a few of them.
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
      <div className={cn(LANDING_MEASURE, "pt-20 pb-14 sm:pt-24 lg:pt-28")}>
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end">
          <div className="min-w-0">
            <h2
              className="fiyu-lp-rise max-w-[16ch] font-display text-[clamp(2.5rem,6vw,5.25rem)] leading-[0.94] tracking-[-0.03em] text-ink"
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
       * The colophon. A ruled index of every published example, wrapping rather
       * than scrolling sideways, so no phone has to discover a hidden axis.
       */}
      <div className={cn(LANDING_MEASURE, "border-t border-line py-8 sm:py-10")}>
        <p className="text-[0.625rem] font-semibold tracking-[0.18em] text-ink-faint uppercase">
          In Tokyo now
        </p>
        <ul
          data-testid="closing-colophon"
          className="mt-5 flex flex-wrap gap-x-8 gap-y-4 sm:gap-x-12"
        >
          {ALL_EXAMPLES.map((example, index) => (
            <li
              key={example.id}
              className="fiyu-lp-rise min-w-0"
              data-in={flag}
              style={
                {
                  "--rise-delay": 320 + index * 60 + "ms",
                  "--rise-from": "8px",
                } as React.CSSProperties
              }
            >
              <p lang="ja" className="truncate font-display text-base leading-tight text-ink">
                {example.nameJa}
              </p>
              <p className="mt-1 truncate text-[0.625rem] tracking-[0.12em] text-ink-faint uppercase">
                {example.area}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

import Link from "next/link";

import { LANDING_MEASURE } from "@/components/landing-page/landingSystem";
import { cn } from "@/lib/utils/cn";

/**
 * An invented neighbourhood, not a place.
 *
 * Abstract enough to stay true anywhere Fiyu opens: no real geography, no real
 * restaurants, no user position. The streets are two families of slightly
 * angled lines running past the frame, so it reads as a fragment of somewhere
 * rather than a diagram of everywhere.
 */
function NearbyDiscoveryPlate() {
  return (
    <svg aria-hidden="true" viewBox="0 0 300 280" className="block h-auto w-full">
      <rect width="300" height="280" fill="var(--color-canvas)" />

      {/* Two blocks give the plate depth without asking it to describe a city. */}
      <path d="M196 36h74v58h-74z" fill="var(--color-lavender-100)" opacity=".5" />
      <path d="M28 188c26-10 52-8 74 6l-12 42H24Z" fill="var(--color-lavender-100)" opacity=".42" />

      <g fill="none" stroke="var(--color-line-strong)" strokeWidth="1" opacity=".7">
        <path d="M-10 66 310 52M-10 140 310 126M-10 214 310 200" />
        <path d="M62 -10 78 290M146 -10 162 290M230 -10 246 290" />
      </g>
      <path
        d="M-10 250C50 226 96 254 152 230S244 194 310 210"
        fill="none"
        stroke="var(--color-line-strong)"
        strokeWidth="1.4"
        opacity=".45"
      />

      {/* The nearby area: a soft reach, deliberately not a measured radius. */}
      <circle cx="150" cy="150" r="78" fill="var(--color-lavender-100)" opacity=".5" />
      <circle
        cx="150"
        cy="150"
        r="78"
        fill="none"
        stroke="var(--color-lavender-500)"
        strokeWidth="1"
        opacity=".3"
      />

      {/* Origin to each pick, faint enough to read as relationship not routing. */}
      <g stroke="var(--color-plum)" strokeWidth="1" strokeLinecap="round" opacity=".22">
        <path d="M150 150 96 108M150 150 206 128M150 150 168 214" />
      </g>

      <g>
        <circle
          cx="206"
          cy="128"
          r="12.5"
          fill="none"
          stroke="var(--color-rose-dust)"
          strokeWidth="1"
          opacity=".45"
        />
        {[
          [96, 108],
          [206, 128],
          [168, 214],
        ].map(([cx, cy]) => (
          <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r="7.5" fill="var(--color-canvas)" />
            <circle cx={cx} cy={cy} r="4.5" fill="var(--color-rose-dust)" />
          </g>
        ))}
      </g>

      <circle cx="150" cy="150" r="13" fill="none" stroke="var(--color-plum)" strokeWidth="1" opacity=".28" />
      <circle cx="150" cy="150" r="10" fill="var(--color-canvas)" />
      <circle cx="150" cy="150" r="5.5" fill="var(--color-plum)" />
    </svg>
  );
}

export function HeroSection() {
  return (
    <section className="relative border-b border-line">
      {/*
       * A tall hero, but not a full viewport: at 1080 the next section stays
       * just in view, so the page reads as a composition rather than a deck.
       */}
      <div
        className={cn(
          LANDING_MEASURE,
          "grid items-center gap-14 py-16 sm:py-20",
          "lg:min-h-[38rem] lg:grid-cols-[minmax(0,1.4fr)_minmax(19rem,0.6fr)] lg:gap-16 lg:py-24",
        )}
      >
        <div className="landing-hero-copy min-w-0">
          <p
            data-testid="landing-wordmark"
            className="font-display text-[clamp(4.5rem,13vw,10rem)] leading-[0.78] tracking-[-0.055em] text-ink"
          >
            Fiyu
          </p>
          {/*
           * The rule binds the masthead to the headline. Without it the two sat
           * as separate blocks and the wordmark simply out-shouted the sentence
           * that carries the product.
           */}
          <span aria-hidden="true" className="mt-8 block h-px w-16 bg-rose-dust sm:mt-10" />
          <h1 className="mt-8 max-w-[46rem] font-display text-[clamp(2.5rem,5.2vw,5rem)] leading-[0.95] tracking-[-0.03em] text-ink sm:mt-10">
            Hidden places. Carefully uncovered.
          </h1>
          <p className="mt-7 max-w-[34rem] text-base leading-8 text-ink-muted sm:text-[1.0625rem]">
            Fiyu combines local-language research, machine learning, and your feedback to uncover
            independent, underexposed restaurants suited to your tastes.
          </p>
          <div className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-7">
            <Link
              href="/picks"
              className="inline-flex min-h-12 items-center rounded-chip bg-plum px-7 text-sm font-medium text-white transition-colors duration-200 ease-(--ease-fiyu) hover:bg-lavender-700"
            >
              Explore Tokyo
            </Link>
            <a
              href="#how-it-works"
              className="text-sm font-medium text-lavender-700 underline decoration-lavender-100 decoration-2 underline-offset-4 transition-colors duration-200 ease-(--ease-fiyu) hover:decoration-lavender-500"
            >
              See how Fiyu works
            </a>
          </div>
        </div>

        {/*
         * A figure rather than a section: the caption explains the plate, so the
         * hero keeps exactly one heading and the illustration itself stays
         * decorative to assistive tech.
         */}
        <figure
          data-testid="hero-nearby-figure"
          className="landing-hero-visual min-w-0 border-t border-line pt-10 lg:self-stretch lg:border-t-0 lg:border-l lg:pt-0 lg:pl-16"
        >
          <div className="mx-auto flex h-full w-full max-w-sm flex-col justify-center lg:mr-0 lg:ml-auto lg:max-w-[20rem]">
            <div className="overflow-hidden rounded-card border border-line">
              <NearbyDiscoveryPlate />
            </div>
            <figcaption className="mt-7">
              <p className="font-display text-[1.625rem] leading-tight text-ink">
                Selected around you.
              </p>
              <p className="mt-3 text-sm leading-7 text-ink-muted">
                Independent restaurants matched to your tastes and nearby area—whether you’re
                exploring a new city or rediscovering your everyday one.
              </p>
            </figcaption>
          </div>
        </figure>
      </div>
      <style>{`
        @keyframes fiyu-landing-rise {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .landing-hero-copy { animation: fiyu-landing-rise 700ms var(--ease-fiyu) both; }
        .landing-hero-visual { animation: fiyu-landing-rise 700ms var(--ease-fiyu) 140ms both; }
        @media (prefers-reduced-motion: reduce) {
          .landing-hero-copy,
          .landing-hero-visual { animation: none; }
        }
      `}</style>
    </section>
  );
}

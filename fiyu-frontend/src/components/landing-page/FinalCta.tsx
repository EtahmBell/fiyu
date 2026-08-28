import Link from "next/link";

import { AuthAwarePicksLink } from "@/components/landing-page/AuthAwarePicksLink";
import { HERO_EXAMPLES } from "@/components/landing-page/landingExamples";
import { LANDING_MEASURE } from "@/components/landing-page/landingSystem";
import { PickComposition } from "@/components/landing-page/PickComposition";
import { cn } from "@/lib/utils/cn";

/**
 * The closing beat.
 *
 * The same three places as the hero, in the same composition, mirrored: cards on
 * the left this time and the line on the right. A reader who has come this far
 * meets the object the page opened with and now knows what it is, which is the
 * only reason to bring it back.
 *
 * "Your next few" is exact. These are the three the hero showed, and the sentence
 * is about them.
 */
export function FinalCta() {
  return (
    <section id="start" className="scroll-mt-24 border-b border-line bg-canvas">
      <div
        className={cn(
          LANDING_MEASURE,
          "grid items-center gap-12 py-20 sm:py-24",
          "lg:grid-cols-[minmax(22rem,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:py-28",
        )}
      >
        <div className="min-w-0 lg:order-1">
          <div className="mx-auto w-full max-w-[24rem] lg:mx-0 lg:max-w-[27rem]">
            <PickComposition examples={HERO_EXAMPLES} />
          </div>
        </div>

        <div className="min-w-0 lg:order-2">
          <h2 className="max-w-[16ch] font-display text-[clamp(2.5rem,5.4vw,4.75rem)] leading-[0.95] tracking-[-0.03em] text-ink">
            Your next few are waiting.
          </h2>
          <span aria-hidden="true" className="mt-8 block h-px w-16 bg-rose-dust" />
          <p className="mt-8 max-w-[30rem] text-base leading-8 text-ink-muted">
            Tokyo is open now. Tell Fiyu what you like, and a small selection of independent
            places will be there when you look.
          </p>
          <div className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-7">
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
    </section>
  );
}

import type { Metadata } from "next";
import Image from "next/image";

import {
  LANDING_HEADING,
  LANDING_MEASURE,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = {
  title: "About Fiyu",
  description: "Why Fiyu uncovers independent restaurants a few considered discoveries at a time.",
};

const SECTIONS = [
  {
    title: "Why Fiyu",
    copy: "Most discovery platforms amplify the restaurants that are already easiest to find. Fiyu looks deeper, combining local-language context with signals around quality, independence, visibility, and local relevance.",
    points: ["Local-language context", "Independent restaurants", "Quality beyond visibility"],
  },
  {
    title: "Why only a few",
    copy: "Some of the places Fiyu finds are small enough that a sudden wave of attention can change the experience that made them worth finding in the first place. Fiyu reveals only a few restaurants to each person, spreading discovery across a broader pool so great local places can retain their character. The result is also a more personal experience: different people uncover different corners of a city.",
    points: [
      "Attention spread across more places",
      "Less pressure on small restaurants",
      "A different discovery for each person",
    ],
  },
  {
    title: "Discovery without the popularity contest",
    copy: "Fiyu is not a leaderboard or an endless review feed. Saves, visits, and reactions quietly improve future selections while the focus stays on the restaurant—not likes, rankings, or what is going viral.",
    points: ["No public leaderboard", "Private signals improve future Picks", "Restaurants stay at the centre"],
  },
] as const;

function TabletopComposition() {
  return (
    <div
      data-testid="about-tabletop"
      className="relative aspect-[4/3] overflow-hidden border border-line bg-surface"
    >
      <Image
        src="/images/about-storefront.png"
        alt="A refined line illustration of a small Tokyo restaurant storefront"
        fill
        priority
        sizes="(min-width: 1024px) 38vw, 100vw"
        className="object-cover object-center"
      />
    </div>
  );
}

export default function AboutPage() {
  return (
    <main className="flex-1">
      <div className={cn(LANDING_MEASURE, "py-14 sm:py-20 lg:py-24")}>
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.02fr)_minmax(22rem,0.82fr)] lg:gap-16">
          <div>
            <SectionEyebrow>About Fiyu</SectionEyebrow>
            <h1 className={cn(LANDING_HEADING, "mt-6 max-w-[15ch] text-ink sm:mt-7")}>
              Finding the places worth knowing.
            </h1>
            <p className="mt-6 max-w-[38rem] text-base leading-8 text-ink-body sm:mt-7 sm:text-lg sm:leading-9">
              Fiyu uncovers independent and underexposed restaurants rather than building another exhaustive directory. Local-language research and deliberately small selections help surface places that deserve a closer look.
            </p>
          </div>
          <TabletopComposition />
        </div>

        <section aria-labelledby="about-principles" className="mt-20 sm:mt-28">
          <div className="grid gap-5 border-b border-line pb-7 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] sm:items-end sm:gap-12 sm:pb-9">
            <div>
              <p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-lavender-700 uppercase">
                Our approach
              </p>
              <h2 id="about-principles" className="mt-3 font-display text-3xl leading-tight text-ink sm:text-4xl">
                Three principles shape every discovery.
              </h2>
            </div>
            <p className="max-w-[38rem] text-sm leading-7 text-ink-body sm:justify-self-end sm:text-base sm:leading-8">
              Fiyu looks past visibility, reveals with restraint, and keeps attention on the place itself.
            </p>
          </div>

          <div
            data-testid="about-principles-grid"
            className="mt-7 grid gap-5 lg:grid-cols-3 lg:gap-x-6 lg:gap-y-6"
          >
            {SECTIONS.map((section, index) => (
              <article
                key={section.title}
                data-testid="about-principle"
                className="relative overflow-hidden rounded-card border border-line bg-surface px-6 pt-7 pb-8 sm:px-8 sm:pt-8 lg:row-span-4 lg:grid lg:grid-rows-subgrid lg:px-7"
              >
                <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-lavender-500" />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-4 right-5 font-display text-7xl leading-none text-lavender-100/70 sm:right-7"
                >
                  0{index + 1}
                </span>
                <span className="relative z-10 text-[0.6875rem] font-semibold tracking-[0.18em] text-lavender-700 uppercase">
                  0{index + 1}
                </span>
                <h3 className="relative z-10 mt-6 max-w-[15ch] font-display text-[1.75rem] leading-[1.05] text-ink sm:text-3xl lg:mt-0">
                  {section.title}
                </h3>
                <p className="relative z-10 mt-5 text-sm leading-7 text-ink-body sm:text-[0.9375rem] lg:mt-0">
                  {section.copy}
                </p>
                <ul className="relative mt-7 space-y-3 border-t border-line pt-5 text-sm leading-6 text-ink-body before:absolute before:-top-px before:left-0 before:h-px before:w-12 before:bg-lavender-400 before:content-[''] lg:mt-0">
                  {section.points.map((point) => (
                    <li key={point} className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-2.5">
                      <span aria-hidden="true" className="mt-[0.65rem] h-px w-3 bg-rose-dust" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section id="how-fiyu-scores" aria-labelledby="scoring-heading" className="mt-16 max-w-3xl scroll-mt-24 border-t border-line pt-8">
          <SectionEyebrow>Our methodology</SectionEyebrow>
          <h2 id="scoring-heading" className="mt-3 font-display text-3xl text-ink">How Fiyu scores places</h2>
          <div className="mt-5 space-y-4 text-sm leading-7 text-ink-body">
            <p>Fiyu is a curated selection, not a directory. The Fiyu Score is a provisional discovery score, not a public review rating or proof of local authenticity. It helps identify worthwhile places that may deserve more attention.</p>
            <p>The current model combines rating-based quality, underexposure, independence and distinctiveness, and local discovery evidence. Local-language sources add context, but their language does not prove who eats at a restaurant. Low exposure alone does not establish quality, and popularity alone does not make a Fiyu discovery.</p>
            <p>Automated publication checks venue eligibility and chain classification, requires completed research, and uses a minimum score of 7.5. Restricted-access venues and excluded chains do not qualify. Older or manually published records can reflect earlier rules.</p>
            <details className="border-y border-line">
              <summary className="min-h-11 cursor-pointer py-3 font-medium text-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600">The factors and weights</summary>
              <div className="space-y-3 pb-4">
                <p>The current model weights quality at 45%, underexposure at 15%, independence and distinctiveness at 15%, and local discovery at 25%. Quality starts with ratings adjusted for review volume. Underexposure considers review volume relative to peers alongside recorded tourist and web visibility. Local discovery combines overlapping visibility, audience, independence and specialization signals.</p>
                <p>The inputs use smoothing, bounded scales and neutral defaults for some unknowns. Eligibility rules and model-specific caps also apply, so the displayed signals are not a simple average. Scores are stored on a 0–100 scale and shown divided by ten, rounded to one decimal.</p>
                <p>Historical models used 30% Japanese-language web signal, 30% underexposure, 25% quality and 15% independence, with additional evidence and identity caps. Historical scores stay as recorded; we do not apply current weights to their breakdown.</p>
              </div>
            </details>
            <p>Research confidence describes identity matching, source coverage, available review-language evidence and consistency. It is separate from the current score and is not a guarantee of restaurant quality. Missing research is not evidence of obscurity.</p>
            <p>Your private ratings and Taste are separate from this restaurant-level score. The Fiyu Score is not a prediction of your personal rating.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

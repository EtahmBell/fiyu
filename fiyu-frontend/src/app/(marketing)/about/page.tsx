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
    copy: "Fiyu reveals only a few places at a time. Each selection feels more personal, while attention is shared across a broader pool instead of concentrating on the same restaurants.",
    points: ["Small, personal selections", "A broader pool of strong places", "Attention shared gradually"],
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

          <div className="mt-7 grid gap-5 lg:grid-cols-3 lg:gap-6">
            {SECTIONS.map((section, index) => (
              <article
                key={section.title}
                data-testid="about-principle"
                className="relative overflow-hidden rounded-card border border-line bg-surface px-6 pt-7 pb-8 sm:px-8 sm:pt-8 lg:px-7"
              >
                <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-lavender-500" />
                <span className="text-[0.6875rem] font-semibold tracking-[0.18em] text-lavender-700 uppercase">
                  0{index + 1}
                </span>
                <h3 className="mt-6 max-w-[15ch] font-display text-[1.75rem] leading-[1.05] text-ink sm:text-3xl">
                  {section.title}
                </h3>
                <p className="mt-5 text-sm leading-7 text-ink-body sm:text-[0.9375rem]">
                  {section.copy}
                </p>
                <ul className="mt-7 space-y-3 border-t border-line pt-5 text-sm leading-6 text-ink-body">
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
      </div>
    </main>
  );
}

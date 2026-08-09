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
    copy: "Traditional discovery platforms often reinforce the restaurants that are already easiest to find. Excellent independent places can be less visible, especially when their strongest local context is not available in English.",
  },
  {
    title: "Why only a few",
    copy: "Endless results make every choice feel interchangeable. Fiyu offers a small set of considered discoveries so each place has room to be understood before the next one appears.",
  },
  {
    title: "How Fiyu gets better",
    copy: "Signals from the restaurants people see, save, visit, and react to can help future selections become more useful. They inform discovery without turning private activity into a public review feed.",
  },
];

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
      <div className={cn(LANDING_MEASURE, "py-16 sm:py-20 lg:py-24")}>
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.02fr)_minmax(22rem,0.82fr)] lg:gap-16">
          <div>
            <SectionEyebrow>About Fiyu</SectionEyebrow>
            <h1 className={cn(LANDING_HEADING, "mt-7 max-w-3xl text-ink")}>
              Finding the places worth knowing.
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-ink-muted sm:text-lg sm:leading-9">
              Fiyu exists to uncover independent and underexposed restaurants—not to become another exhaustive directory. Local-language research, machine learning, and a deliberately small number of discoveries help surface places that deserve a closer look.
            </p>
          </div>
          <TabletopComposition />
        </div>

        <div className="mt-20 max-w-6xl sm:mt-28">
          {SECTIONS.map((section, index) => (
            <section
              key={section.title}
              className="grid gap-5 border-t border-line py-10 sm:grid-cols-[minmax(10rem,0.75fr)_minmax(0,1.45fr)] sm:gap-14 sm:py-14"
            >
              <div>
                <span className="text-[0.625rem] font-semibold tracking-[0.18em] text-lavender-700 uppercase">
                  0{index + 1}
                </span>
                <h2 className="mt-3 font-display text-2xl leading-tight text-ink sm:text-3xl">
                  {section.title}
                </h2>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-ink-muted sm:pt-6 sm:text-base sm:leading-8">
                {section.copy}
              </p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

import type { ReactNode } from "react";

import {
  LANDING_HEADING,
  LANDING_MEASURE,
  SectionEyebrow,
} from "@/components/landing-page/landingSystem";
import { cn } from "@/lib/utils/cn";

export function PublicEditorialPage({
  eyebrow,
  title,
  intro,
  children,
  narrow = false,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
  narrow?: boolean;
}) {
  return (
    <main className="flex-1">
      <div className={cn(LANDING_MEASURE, "py-16 sm:py-20 lg:py-24")}>
        <div className={cn(narrow ? "max-w-3xl" : "max-w-5xl")}>
          <SectionEyebrow>{eyebrow}</SectionEyebrow>
          <h1 className={cn(LANDING_HEADING, "mt-7 max-w-4xl text-ink")}>{title}</h1>
          <p className="mt-7 max-w-3xl text-base leading-8 text-ink-muted sm:text-lg sm:leading-9">
            {intro}
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}

export function EditorialSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-line py-9 sm:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1.5fr)] sm:gap-12 sm:py-11">
      <h2 className="font-display text-2xl leading-tight text-ink sm:text-3xl">{title}</h2>
      <div className="max-w-2xl text-sm leading-7 text-ink-muted sm:text-base sm:leading-8">
        {children}
      </div>
    </section>
  );
}

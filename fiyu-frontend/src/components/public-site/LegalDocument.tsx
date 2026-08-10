import Link from "next/link";
import type { ReactNode } from "react";

import { PublicEditorialPage } from "@/components/public-site/PublicEditorialPage";

export type LegalNavItem = {
  href: string;
  label: string;
};

export function LegalDocument({
  eyebrow,
  title,
  intro,
  sections,
  relatedHref,
  relatedLabel,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: LegalNavItem[];
  relatedHref: string;
  relatedLabel: string;
  children: ReactNode;
}) {
  return (
    <PublicEditorialPage eyebrow={eyebrow} title={title} intro={intro} narrow>
      <div className="max-w-3xl">
        <div className="mt-10 border-y border-line py-5 sm:mt-12">
          <p className="text-xs font-semibold tracking-[0.14em] text-ink-faint uppercase">
            Effective Date: August 10, 2026
          </p>
        </div>

        <nav aria-label={`${title} sections`} className="border-b border-line py-8 sm:py-10">
          <p className="text-xs font-semibold tracking-[0.14em] text-ink-faint uppercase">On this page</p>
          <ol className="mt-5 grid gap-x-8 gap-y-3 text-sm leading-6 text-ink-muted sm:grid-cols-2">
            {sections.map((section) => (
              <li key={section.href}>
                <a
                  href={section.href}
                  className="inline-flex min-h-8 items-center underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-rose-dust"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article>{children}</article>

        <aside className="mt-2 flex flex-col gap-3 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-7 text-ink-muted">Related legal information</p>
          <Link
            href={relatedHref}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-plum underline decoration-line underline-offset-4 transition-colors hover:text-lavender-700 hover:decoration-rose-dust"
          >
            {relatedLabel} →
          </Link>
        </aside>
      </div>
    </PublicEditorialPage>
  );
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-line py-9 sm:py-11">
      <h2 className="font-display text-2xl leading-tight text-ink sm:text-3xl">{title}</h2>
      <div className="mt-5 space-y-5 text-sm leading-7 text-ink-muted sm:text-base sm:leading-8">
        {children}
      </div>
    </section>
  );
}

export function LegalSubsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-2">
      <h3 className="text-sm font-semibold tracking-[0.04em] text-ink sm:text-base">{title}</h3>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="ml-5 list-disc space-y-2 marker:text-lavender-500">{children}</ul>;
}

export const legalInlineLink =
  "font-medium text-plum underline decoration-line underline-offset-4 transition-colors hover:text-lavender-700 hover:decoration-rose-dust";

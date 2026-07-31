import Link from "next/link";

import { LANDING_MEASURE } from "@/components/landing-page/landingSystem";
import { cn } from "@/lib/utils/cn";

const footerLink =
  "text-ink-muted underline decoration-transparent decoration-1 underline-offset-[6px] transition-colors duration-200 ease-(--ease-fiyu) hover:text-ink hover:decoration-rose-dust";

export function LandingFooter() {
  return (
    <footer className="bg-canvas">
      <div className={cn(LANDING_MEASURE, "pt-14 pb-12 lg:pt-16")}>
        {/*
         * Brand and navigation share the page grid, then a hairline separates
         * them from the legal and attribution line -- three clear groups rather
         * than one block of small type.
         */}
        <div className="grid gap-9 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-16">
          <div className="min-w-0">
            <Link
              href="/"
              className="font-display text-[1.625rem] leading-none tracking-[-0.02em] text-ink transition-colors duration-200 ease-(--ease-fiyu) hover:text-lavender-700"
            >
              Fiyu
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-7 text-ink-muted">
              Independent restaurants, uncovered a few at a time.
            </p>
          </div>

          <nav
            aria-label="Landing footer"
            className="flex flex-col gap-4 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8"
          >
            <Link className={footerLink} href="/picks">
              Explore Tokyo
            </Link>
            <Link className={footerLink} href="/profile#privacy">
              Privacy
            </Link>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-xs leading-6 text-ink-faint md:flex-row md:items-center md:justify-between md:gap-8">
          <p>© 2026 Fiyu.</p>
          <p>
            World map made with{" "}
            <a
              href="https://www.naturalearthdata.com/"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-line underline-offset-2 transition-colors duration-200 ease-(--ease-fiyu) hover:text-ink-muted hover:decoration-rose-dust"
            >
              Natural Earth
            </a>
            , public domain.
          </p>
        </div>
      </div>
    </footer>
  );
}

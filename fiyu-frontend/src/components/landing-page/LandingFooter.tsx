import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-[90rem] gap-9 px-5 py-10 sm:px-8 md:grid-cols-[1fr_auto] md:items-start lg:px-12 lg:py-14">
        <div>
          <Link href="/" className="font-display text-3xl text-ink">
            Fiyu
          </Link>
          <p className="mt-3 max-w-md text-sm leading-6 text-ink-muted">
            Independent restaurants, uncovered a few at a time.
          </p>
        </div>

        <nav aria-label="Landing footer" className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
          <Link className="text-ink-muted underline-offset-4 hover:text-ink hover:underline" href="/picks">
            Explore Tokyo
          </Link>
          <a className="text-ink-muted underline-offset-4 hover:text-ink hover:underline" href="#how-it-works">
            How Fiyu works
          </a>
          <a className="text-ink-muted underline-offset-4 hover:text-ink hover:underline" href="#why-few">
            Why only a few?
          </a>
          <Link className="text-ink-muted underline-offset-4 hover:text-ink hover:underline" href="/profile#privacy">
            Privacy
          </Link>
        </nav>

        <div className="space-y-2 text-xs leading-5 text-ink-faint md:col-span-2 md:flex md:items-center md:justify-between md:space-y-0">
          <p>© 2026 Fiyu.</p>
          <p>
            World map made with{" "}
            <a
              href="https://www.naturalearthdata.com/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-ink-muted"
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

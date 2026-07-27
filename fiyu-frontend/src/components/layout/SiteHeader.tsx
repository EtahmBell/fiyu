import Link from "next/link";

/**
 * Slim brand bar.
 *
 * Fiyu is the application and Tokyo is one section within it, so the wordmark
 * gets a persistent 56px bar and the section title lives in the scrolling
 * column (see PageIntro). Keeping the bar slim is what lets the desktop split
 * fill the rest of the viewport.
 *
 * The wordmark is a link, not a heading: it identifies the site on every page,
 * and a second <h1> would compete with the section title.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 h-header border-b border-line bg-canvas/95">
      <div className="mx-auto flex h-full w-full max-w-[1560px] items-center gap-3 px-5 sm:px-8">
        <Link
          href="/"
          className="font-display text-[1.35rem] leading-none text-ink transition-colors duration-200 ease-(--ease-fiyu) hover:text-lavender-700"
        >
          Fiyu
        </Link>
        <span aria-hidden="true" className="h-4 w-px bg-line-strong" />
        <span className="text-[0.6875rem] tracking-[0.16em] text-ink-faint uppercase">
          Tokyo
        </span>
      </div>
    </header>
  );
}

/**
 * Section masthead. Scrolls with the list column rather than occupying
 * permanent vertical space beside the map.
 */
export function PageIntro() {
  return (
    <div className="px-1 pt-8 pb-6 sm:pt-10">
      <h1 className="font-display text-5xl leading-[0.95] text-ink sm:text-[3.5rem]">Tokyo</h1>
      <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-ink-muted">
        Authentic, independent, underexposed restaurants — scored, explained, and mapped.
      </p>
    </div>
  );
}

export function SiteFooter() {
  return (
    <div className="mt-10 border-t border-line px-1 py-6 text-xs leading-relaxed text-ink-faint">
      Fiyu scores are Fiyu&apos;s own editorial signal, not a Google rating. Live Google
      information is fetched only when a restaurant is opened.
    </div>
  );
}

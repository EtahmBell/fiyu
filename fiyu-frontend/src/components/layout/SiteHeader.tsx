/**
 * Masthead. Shared by the page and its loading state so the two cannot drift
 * apart, and so the header stays put instead of flashing during navigation.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-hairline bg-surface">
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
        <p className="text-xs tracking-[0.2em] text-ink-faint uppercase">Tokyo</p>
        <h1 className="mt-1 font-display text-4xl leading-none text-ink sm:text-5xl">Fiyu</h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-muted">
          Authentic, independent, underexposed restaurants — scored, explained, and mapped.
        </p>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline px-5 py-6 text-xs text-ink-faint sm:px-8">
      <div className="mx-auto max-w-6xl">
        Fiyu scores are Fiyu&apos;s own editorial signal, not a Google rating. Live Google
        information is fetched only when a restaurant is opened.
      </div>
    </footer>
  );
}

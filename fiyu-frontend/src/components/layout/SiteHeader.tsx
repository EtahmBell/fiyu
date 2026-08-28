import { ApplicationNavigation } from "@/components/layout/ApplicationNavigation";

/** Shared responsive application chrome; active-route logic stays client-side. */
export function SiteHeader() {
  return <ApplicationNavigation />;
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
        Authentic, independent, underexposed restaurants — a few at a time.
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

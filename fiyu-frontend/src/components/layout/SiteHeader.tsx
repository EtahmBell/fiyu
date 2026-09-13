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
      <p className="font-display text-5xl leading-[0.95] text-ink sm:text-[3.5rem]">Tokyo</p>
      <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-ink-muted">
        Authentic, independent, underexposed restaurants — a few at a time.
      </p>
    </div>
  );
}

/**
 * The score provenance note.
 *
 * Both sentences are load-bearing -- one says whose judgement the number is,
 * the other says when Google is contacted -- so the wording and the size are
 * untouched. What went is the space around it: a quieter footer is one that
 * occupies less of the page, not one set in smaller or fainter type.
 *
 * `ink-muted` rather than `ink-faint` for exactly that reason. At 12px this
 * needs 4.5:1 to meet AA, and faint resolves to about 2.9:1 on canvas against
 * muted's 4.76:1. A provenance note is the last piece of copy on the page that
 * should be hard to read.
 */
export function SiteFooter() {
  return (
    <div className="mt-8 max-w-prose border-t border-line px-1 pt-4 pb-2 text-xs leading-5 text-ink-muted">
      Fiyu scores are Fiyu&apos;s own editorial signal, not a Google rating. Live Google
      information is fetched only when a restaurant is opened.
    </div>
  );
}

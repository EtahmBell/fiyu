import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-[90rem] gap-8 px-5 py-10 sm:px-8 md:grid-cols-[1fr_auto] md:items-end lg:px-12">
        <div>
          <Link href="/" className="font-display text-2xl text-ink">
            Fiyu
          </Link>
          <p className="mt-3 max-w-md text-sm leading-6 text-ink-muted">
            A considered way to discover independent restaurants, beginning in Tokyo.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <Link className="text-ink-muted underline-offset-4 hover:text-ink hover:underline" href="/picks">
            Today&apos;s Picks
          </Link>
          <Link className="text-ink-muted underline-offset-4 hover:text-ink hover:underline" href="/map">
            Tokyo map
          </Link>
        </div>

        <p className="text-xs leading-5 text-ink-faint md:col-span-2">
          Fiyu scores are an independent editorial signal, not a Google rating.
        </p>
      </div>
    </footer>
  );
}

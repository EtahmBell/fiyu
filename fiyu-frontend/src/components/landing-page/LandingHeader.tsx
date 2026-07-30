import Link from "next/link";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/92 backdrop-blur-md">
      <div className="mx-auto flex min-h-16 w-full max-w-[90rem] items-center px-5 sm:px-8 lg:px-12">
        <Link
          href="/"
          aria-label="Fiyu home"
          className="font-display text-[1.7rem] leading-none text-ink transition-colors hover:text-lavender-700"
        >
          Fiyu
        </Link>

        <nav aria-label="Landing page" className="ml-auto hidden items-center gap-8 md:flex">
          <a className="text-sm text-ink-muted transition-colors hover:text-ink" href="#approach">
            Our approach
          </a>
          <a className="text-sm text-ink-muted transition-colors hover:text-ink" href="#tokyo">
            Tokyo
          </a>
        </nav>

        <Link
          href="/picks"
          className="ml-auto inline-flex min-h-11 items-center rounded-chip bg-plum px-5 text-sm font-medium text-white transition-colors hover:bg-lavender-700 md:ml-8"
        >
          Open Fiyu
        </Link>
      </div>
    </header>
  );
}

import Link from "next/link";

export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden border-b border-line">
      <div aria-hidden="true" className="absolute inset-y-0 right-0 -z-10 hidden w-[34%] border-l border-line bg-lavender-50/45 lg:block" />
      <div className="mx-auto grid min-h-[calc(88dvh-4rem)] w-full max-w-[90rem] items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.55fr)] lg:px-12 lg:py-24">
        <div className="landing-hero-copy max-w-5xl">
          <p
            data-testid="landing-wordmark"
            className="font-display text-[clamp(5rem,18vw,13rem)] leading-[0.72] tracking-[-0.06em] text-ink"
          >
            Fiyu
          </p>
          <h1 className="mt-10 max-w-4xl font-display text-[clamp(2.75rem,6vw,5.75rem)] leading-[0.92] tracking-[-0.035em] text-ink sm:mt-14">
            Hidden places. Carefully uncovered.
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">
            Fiyu combines local-language research, machine learning, and your feedback to uncover
            independent, underexposed restaurants suited to your tastes.
          </p>
          <div className="mt-9 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <Link
              href="/picks"
              className="inline-flex min-h-12 items-center rounded-chip bg-plum px-7 text-sm font-medium text-white transition-colors hover:bg-lavender-700"
            >
              Explore Tokyo
            </Link>
            <a
              href="#how-it-works"
              className="text-sm font-medium text-lavender-700 underline decoration-lavender-100 decoration-2 underline-offset-4 hover:decoration-lavender-500"
            >
              See how Fiyu works
            </a>
          </div>
        </div>

        <div aria-hidden="true" className="hidden lg:block">
          <div className="ml-auto w-full max-w-xs border-y border-line py-10">
            <p lang="ja" className="text-center text-8xl font-light tracking-[-0.12em] text-lavender-100">
              暖簾
            </p>
            <div className="mx-auto mt-8 h-px w-20 bg-rose-dust" />
            <p className="mt-5 text-center font-display text-2xl text-ink">A quiet way in</p>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes fiyu-landing-rise {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .landing-hero-copy { animation: fiyu-landing-rise 700ms var(--ease-fiyu) both; }
        @media (prefers-reduced-motion: reduce) {
          .landing-hero-copy { animation: none; }
        }
      `}</style>
    </section>
  );
}

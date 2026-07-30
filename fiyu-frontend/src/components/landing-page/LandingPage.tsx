import Link from "next/link";

const principles = [
  {
    number: "01",
    title: "A smaller daily choice",
    body: "Three considered restaurants replace an endless directory. The set renews each day, so discovery stays focused.",
  },
  {
    number: "02",
    title: "Context before hype",
    body: "Fiyu explains why each restaurant belongs in the selection without leaning on generic popularity language.",
  },
  {
    number: "03",
    title: "The city stays visible",
    body: "A restrained map keeps each discovery grounded in its Tokyo neighborhood without pretending to be a directions app.",
  },
] as const;

export function LandingPage() {
  return (
    <main>
      <section className="relative isolate overflow-hidden border-b border-line">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 -z-10 hidden w-[42%] border-l border-line bg-lavender-50/60 lg:block"
        />
        <div className="mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-[90rem] items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] lg:px-12 lg:py-24">
          <div className="max-w-5xl">
            <p className="text-xs font-semibold tracking-[0.18em] text-lavender-700 uppercase">
              Independent restaurant discovery
            </p>
            <h1 className="mt-5 max-w-5xl font-display text-[clamp(3.65rem,10vw,9rem)] leading-[0.82] tracking-[-0.045em] text-ink">
              Find the Tokyo you can taste.
            </h1>
            <p className="mt-8 max-w-2xl text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">
              Fiyu offers three thoughtful restaurant discoveries each day—less noise, more
              context, and a reason to go somewhere new.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/picks"
                className="inline-flex min-h-12 items-center rounded-chip bg-plum px-7 text-sm font-medium text-white transition-colors hover:bg-lavender-700"
              >
                Discover today&apos;s picks
              </Link>
              <span className="text-sm text-ink-muted">Tokyo edition now open</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm border-y border-line py-8 lg:max-w-none lg:border-y-0 lg:py-0">
            <p aria-hidden="true" lang="ja" className="text-center text-[clamp(5rem,15vw,11rem)] font-light leading-none tracking-[-0.12em] text-lavender-100 lg:text-[9rem]">
              東京
            </p>
            <div className="mt-6 grid grid-cols-3 border-y border-line py-5 text-center lg:mt-10">
              <div>
                <p className="font-display text-3xl text-ink">3</p>
                <p className="mt-1 text-[0.6875rem] tracking-wide text-ink-faint uppercase">Picks</p>
              </div>
              <div className="border-x border-line">
                <p className="font-display text-3xl text-ink">24h</p>
                <p className="mt-1 text-[0.6875rem] tracking-wide text-ink-faint uppercase">Window</p>
              </div>
              <div>
                <p className="font-display text-3xl text-ink">1</p>
                <p className="mt-1 text-[0.6875rem] tracking-wide text-ink-faint uppercase">City</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="approach" className="scroll-mt-20 bg-surface">
        <div className="mx-auto w-full max-w-[90rem] px-5 py-16 sm:px-8 sm:py-24 lg:px-12 lg:py-28">
          <div className="grid gap-8 border-b border-line pb-12 md:grid-cols-[0.7fr_1.3fr] md:items-end">
            <p className="text-xs font-semibold tracking-[0.18em] text-lavender-700 uppercase">
              The Fiyu approach
            </p>
            <h2 className="max-w-3xl font-display text-4xl leading-[0.95] text-ink sm:text-6xl">
              A deliberate alternative to searching everything.
            </h2>
          </div>

          <div className="grid md:grid-cols-3">
            {principles.map((principle) => (
              <article
                key={principle.number}
                className="border-b border-line py-8 md:border-r md:border-b-0 md:px-7 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
              >
                <p className="text-xs font-semibold text-lavender-700">{principle.number}</p>
                <h3 className="mt-8 font-display text-3xl text-ink">{principle.title}</h3>
                <p className="mt-4 text-sm leading-7 text-ink-muted">{principle.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="tokyo" className="scroll-mt-20 border-y border-line bg-plum text-white">
        <div className="mx-auto grid w-full max-w-[90rem] gap-10 px-5 py-16 sm:px-8 sm:py-20 md:grid-cols-[0.75fr_1.25fr] md:items-center lg:px-12 lg:py-24">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-lavender-100 uppercase">
              First city
            </p>
            <p lang="ja" className="mt-5 text-7xl font-light tracking-[-0.12em] text-lavender-100 sm:text-8xl">
              東京
            </p>
          </div>
          <div>
            <h2 className="font-display text-4xl leading-none sm:text-6xl">Tokyo, beyond the obvious.</h2>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/70">
              Explore independent and underexposed restaurants through a concise daily selection,
              with each place connected to the neighborhood around it.
            </p>
            <Link
              href="/picks"
              className="mt-8 inline-flex min-h-12 items-center rounded-chip bg-white px-7 text-sm font-medium text-plum transition-colors hover:bg-lavender-100"
            >
              Enter the Tokyo edition
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

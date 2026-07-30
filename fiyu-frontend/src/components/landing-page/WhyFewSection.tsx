export function WhyFewSection() {
  return (
    <section id="why-few" className="scroll-mt-20 border-y border-line bg-lavender-50/35">
      <div className="mx-auto grid w-full max-w-[90rem] gap-8 px-5 py-16 sm:px-8 sm:py-20 md:grid-cols-[0.8fr_1.2fr] md:items-center lg:px-12 lg:py-24">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-lavender-700 uppercase">
            A slower reveal
          </p>
          <h2 className="mt-5 max-w-lg font-display text-4xl leading-[0.95] text-ink sm:text-6xl">
            Why only a few restaurants at a time?
          </h2>
        </div>
        <div>
          <p className="max-w-2xl text-base leading-8 text-ink-muted sm:text-lg">
            Great small restaurants can be overwhelmed by sudden attention. Fiyu reveals
            discoveries gradually through small, personalized selections drawn from a broader
            pool of similarly strong places. Fiyu is designed to vary recommendations across users
            instead of directing everyone to the same restaurants, helping keep discovery
            thoughtful while reducing the risk of overwhelming the places and communities that
            make them special.
          </p>
          <div aria-hidden="true" className="mt-10 flex h-8 items-start">
            <span className="h-px flex-1 bg-line-strong" />
            <span className="h-7 w-12 border-x border-b border-line-strong" />
            <span className="h-px flex-1 bg-line-strong" />
          </div>
        </div>
      </div>
    </section>
  );
}

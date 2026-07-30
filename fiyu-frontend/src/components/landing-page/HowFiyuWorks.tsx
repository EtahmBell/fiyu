const steps = [
  {
    number: "01",
    title: "Tell us what you like",
    copy: "Choose your food interests and how adventurous you want to be.",
  },
  {
    number: "02",
    title: "Receive a few considered picks",
    copy: "Fiyu selects a small daily set instead of giving you an endless feed.",
  },
  {
    number: "03",
    title: "Reveal, save, and visit",
    copy: "Explore each restaurant, keep the ones you love, and experience the city thoughtfully.",
  },
] as const;

export function HowFiyuWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-surface">
      <div className="mx-auto w-full max-w-[90rem] px-5 py-16 sm:px-8 sm:py-24 lg:px-12 lg:py-28">
        <div className="grid gap-5 md:grid-cols-[0.7fr_1.3fr] md:items-end">
          <p className="text-xs font-semibold tracking-[0.18em] text-lavender-700 uppercase">
            The rhythm
          </p>
          <h2 className="font-display text-5xl leading-none text-ink sm:text-7xl">How Fiyu works</h2>
        </div>

        <ol className="mt-12 grid border-t border-line md:mt-16 md:grid-cols-3">
          {steps.map((step) => (
            <li
              key={step.number}
              className="relative border-b border-line py-8 md:border-r md:border-b-0 md:px-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
            >
              <div aria-hidden="true" className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full border border-rose-dust font-display text-base text-plum">
                  {step.number}
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <h3 className="mt-9 max-w-xs font-display text-3xl leading-tight text-ink">
                {step.title}
              </h3>
              <p className="mt-4 max-w-sm text-sm leading-7 text-ink-muted">{step.copy}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

import Link from "next/link";

export function MyPickEntry() {
  return <aside className="mt-6 rounded-card border border-lavender-100 bg-lavender-50/35 p-5" aria-labelledby="my-pick-entry-title"><p className="text-xs font-semibold tracking-[0.14em] text-lavender-700 uppercase">Have somewhere in mind?</p><h2 id="my-pick-entry-title" className="mt-2 font-display text-2xl text-ink">Try My Pick</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Choose a Tokyo restaurant and Fiyu will research it using the same scoring process as the catalog.</p><Link href="/my-pick" className="mt-4 inline-flex min-h-11 items-center font-semibold text-plum underline decoration-lavender-300 underline-offset-4">Choose a restaurant →</Link></aside>;
}

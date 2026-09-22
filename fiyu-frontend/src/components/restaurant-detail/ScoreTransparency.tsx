import Link from "next/link";

import type { PublicRestaurantDetail } from "@/lib/api/schemas";

export function ScoreTransparency({ restaurant }: { restaurant: PublicRestaurantDetail }) {
  const explanation = restaurant.score_transparency;
  return (
    <section id="why-fiyu-found-it" aria-labelledby="why-fiyu-heading" className="min-w-0 scroll-mt-20 border-t border-line pt-5">
      <h2 id="why-fiyu-heading" className="font-display text-2xl text-ink">Why Fiyu found it</h2>
      {explanation?.reasons.length ? (
        <p className="mt-3 text-sm leading-6 text-ink-body">{explanation.reasons.join(" ")}</p>
      ) : (
        <p className="mt-3 text-sm leading-6 text-ink-muted">Detailed discovery evidence is not available for this restaurant.</p>
      )}
      <details className="mt-4 border-y border-line">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600">
          Signals behind the score
        </summary>
        <div className="space-y-3 pb-4 text-xs leading-5 text-ink-muted">
          <p>{explanation?.model_label ?? "Scoring details unavailable"}. These are stored model signals on a 0–10 scale, not separate ratings. Their simple average does not produce the Fiyu Score; weighting and model-specific caps apply.</p>
          {explanation?.signals.length ? (
            <dl className="divide-y divide-line">
              {explanation.signals.map((signal) => (
                <div key={signal.key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-3">
                  <dt className="text-sm font-medium text-ink">{signal.label}</dt>
                  <dd className="text-sm tabular-nums text-ink">{signal.value.toFixed(1)}<span className="text-ink-muted"> / 10</span></dd>
                  <dd className="col-span-2">{signal.description}</dd>
                </div>
              ))}
            </dl>
          ) : <p>A reliable component breakdown is not available for this record. The published score has not been recalculated.</p>}
          {explanation?.evidence_confidence && <p>Research confidence: {explanation.evidence_confidence}. This describes recorded evidence coverage and consistency, not verified food quality.</p>}
        </div>
      </details>
      <Link href="/about#how-fiyu-scores" className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-lavender-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600">
        How Fiyu scores places <span aria-hidden="true" className="ml-1">→</span>
      </Link>
    </section>
  );
}

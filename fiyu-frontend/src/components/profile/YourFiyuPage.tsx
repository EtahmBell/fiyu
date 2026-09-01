"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ProfileIdentityAvatar, profileIdentityPresentation } from "@/components/profile/ProfileIdentityAvatar";
import { FiyuLoadingScreen } from "@/components/states/FiyuLoadingScreen";
import { useAccountQuery } from "@/lib/accountQueryCache";
import { acknowledgeTasteUpdate, fetchUserFiyuSummary } from "@/lib/api/client";
import type { UserFiyuSummary } from "@/lib/api/schemas";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";

function visitDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5 stars`} className="tracking-[0.08em] text-lavender-700">
      <span aria-hidden="true">{"★".repeat(rating)}{"☆".repeat(5 - rating)}</span>
    </span>
  );
}

function Progress({
  summary,
  context = "taste",
}: {
  summary: UserFiyuSummary;
  context?: "taste" | "together";
}) {
  const threshold = context === "together"
    ? summary.together_unlock_threshold
    : summary.taste_unlock_threshold;
  const completed = Math.min(summary.rated_visit_count, threshold);
  const percentage = (completed / threshold) * 100;
  const remaining = Math.max(threshold - completed, 0);
  const copy = context === "together"
    ? completed === 0
      ? `Rate your first ${threshold} visits to unlock Fiyu Together.`
      : `Rate ${remaining} more visit${remaining === 1 ? "" : "s"} to unlock Fiyu Together.`
    : completed === 0
      ? `Rate your first ${threshold} visits to unlock your first Taste.`
      : `Rate ${remaining} more visit${remaining === 1 ? "" : "s"} to unlock your first Taste.`;

  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div
          className="h-full rounded-full bg-lavender-500 transition-[width] duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="mt-3 flex items-start justify-between gap-5 text-sm text-ink-muted">
        <p className="max-w-lg leading-6">{copy}</p>
        <p className="shrink-0 font-medium text-ink">
          {completed}/{threshold}
        </p>
      </div>
    </div>
  );
}

function TasteUpdateProgress({ summary }: { summary: UserFiyuSummary }) {
  const currentFloor = summary.taste_current_milestone ?? summary.taste_unlock_threshold;
  const span = summary.taste_next_milestone - currentFloor;
  const completed = Math.max(summary.rated_visit_count - currentFloor, 0);
  const percentage = span > 0 ? Math.min((completed / span) * 100, 100) : 0;
  const remaining = summary.ratings_until_next_taste_update;
  return (
    <div className="mt-7 border-t border-line pt-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[0.625rem] font-semibold tracking-[0.14em] text-ink-faint uppercase">Next Taste update</p>
          <p className="mt-1 text-sm text-ink-muted">
            {remaining} more rating{remaining === 1 ? "" : "s"} until your next Taste update.
          </p>
        </div>
        <p className="shrink-0 text-sm font-medium text-ink">
          {summary.rated_visit_count}/{summary.taste_next_milestone}
        </p>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div className="h-full rounded-full bg-lavender-500 transition-[width] duration-300" style={{ width: `${percentage}%` }} />
      </div>
      <p className="mt-3 text-xs text-ink-faint">Every rating helps Fiyu understand your taste.</p>
    </div>
  );
}

function changeLabel(value: UserFiyuSummary["taste_insights"][number]["change_status"]): string | null {
  if (value === "new") return "New";
  if (value === "stronger") return "Getting stronger";
  if (value === "still_true") return "Still true";
  if (value === "emerging") return "Emerging";
  return null;
}

function confidenceLabel(insight: UserFiyuSummary["taste_insights"][number]): string {
  const change = changeLabel(insight.change_status);
  if (change) return change;
  if (insight.type === "strong_signal") return "Strong signal";
  if (insight.type === "reliable_pattern") return "Reliable pattern";
  if (insight.type === "contrast") return "Supported contrast";
  if (insight.type === "emerging") return "Emerging";
  return "Early signal";
}

function TasteSection({
  summary,
  onAcknowledge,
}: {
  summary: UserFiyuSummary;
  onAcknowledge: (milestone: number) => Promise<void>;
}) {
  const [revealed, setRevealed] = useState(!summary.taste_has_unseen_update);
  useEffect(() => {
    if (!summary.taste_has_unseen_update || summary.taste_current_milestone === null) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let frame: number | null = null;
    if (reduced) {
      queueMicrotask(() => setRevealed(true));
    } else {
      frame = window.requestAnimationFrame(() => setRevealed(true));
    }
    void onAcknowledge(summary.taste_current_milestone).catch(() => undefined);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [onAcknowledge, summary.taste_current_milestone, summary.taste_has_unseen_update]);

  if (!summary.taste_unlocked) {
    return (
      <section className="rounded-card border border-line bg-surface p-5 sm:p-7" aria-labelledby="taste-title">
        <p className="text-[0.6875rem] font-semibold tracking-[0.16em] text-lavender-700 uppercase">Taking shape</p>
        <h2 id="taste-title" className="mt-2 font-display text-3xl text-ink">Your taste</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-body">
          Your ratings help Fiyu recognize patterns without turning a single meal into a verdict.
        </p>
        <div className="mt-6"><Progress summary={summary} /></div>
      </section>
    );
  }

  return (
    <section className="rounded-card border border-line bg-surface p-5 sm:p-7" aria-labelledby="taste-title">
      <p className="text-[0.6875rem] font-semibold tracking-[0.16em] text-lavender-700 uppercase">
        {summary.taste_has_unseen_update ? "Your Taste just updated" : `Based on ${summary.rated_visit_count} rated visits`}
      </p>
      <h2 id="taste-title" className="mt-2 font-display text-3xl text-ink">Your taste</h2>
      {summary.taste_insights.length > 0 ? (
        <div className="mt-6 grid gap-3">
          {summary.taste_insights.map((insight, index) => {
            const label = confidenceLabel(insight);
            return (
              <article
                key={insight.id}
                className={`border-t border-line pt-4 transition duration-500 motion-reduce:translate-y-0 motion-reduce:opacity-100 ${revealed || !summary.taste_has_unseen_update ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}
                style={{ transitionDelay: `${index * 90}ms` }}
              >
                <p className="text-[0.625rem] font-semibold tracking-[0.14em] text-lavender-700 uppercase">{label}</p>
                <h3 className="mt-1 font-display text-xl leading-snug text-ink">{insight.headline}</h3>
                <p className="mt-1.5 text-sm leading-6 text-ink-muted">{insight.description}</p>
              </article>
            );
          })}
        </div>
      ) : null}
      {summary.taste_tags.length > 0 ? (
        <div className="mt-7 border-t border-line pt-5">
          <p className="text-[0.625rem] font-semibold tracking-[0.14em] text-ink-faint uppercase">
            Your taste right now
          </p>
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Your Taste right now">
            {summary.taste_tags.map((tag) => (
              <span key={tag.key} className="rounded-full border border-lavender-200 bg-lavender-50 px-3 py-1.5 text-xs font-medium text-plum">
                {tag.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <TasteUpdateProgress summary={summary} />
    </section>
  );
}

function RecentVisits({ summary }: { summary: UserFiyuSummary }) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 sm:p-7" aria-labelledby="recent-visits-title">
      <div className="flex items-end justify-between gap-4 border-b border-line pb-4">
        <h2 id="recent-visits-title" className="font-display text-3xl text-ink">Recent visits</h2>
        <Link href="/log/history" className="min-h-11 py-3 text-sm font-medium text-plum hover:text-lavender-700">
          View all →
        </Link>
      </div>
      {summary.recent_visits.length > 0 ? (
        <ol className="divide-y divide-line">
          {summary.recent_visits.map((visit) => {
            const primaryName = visit.name_ja || visit.name_en || "Restaurant";
            const secondaryName = visit.name_ja && visit.name_en ? visit.name_en : null;
            return (
              <li key={visit.id || `${visit.place_id}-${visit.visited_at}`} className="py-5 first:pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link href={`/restaurants/${encodeURIComponent(visit.place_id)}`} className="font-jp text-base font-semibold text-ink hover:text-lavender-700">
                      {primaryName}
                    </Link>
                    {secondaryName ? <p className="mt-0.5 truncate text-sm text-ink-muted">{secondaryName}</p> : null}
                  </div>
                  {visit.rating ? <Stars rating={visit.rating} /> : null}
                </div>
                <p className="mt-2 text-xs tracking-[0.04em] text-ink-faint">
                  {[visitDate(visit.visited_at), visit.area].filter(Boolean).join(" · ")}
                </p>
                {visit.private_note_excerpt ? (
                  <p className="mt-3 border-l border-gold-line pl-3 text-sm leading-6 text-ink-muted">
                    <span className="mr-2 text-[0.625rem] font-semibold tracking-[0.12em] text-gold-700 uppercase">Private note</span>
                    {visit.private_note_excerpt}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="py-8">
          <p className="font-display text-xl text-ink">No visits logged yet</p>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Your most recent restaurant visits will appear here.</p>
          <Link href="/log" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-plum">Log a visit →</Link>
        </div>
      )}
    </section>
  );
}

function Together({ summary }: { summary: UserFiyuSummary }) {
  return (
    <section className="rounded-card border border-gold-line bg-surface p-5 sm:p-7" aria-labelledby="together-title">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[0.6875rem] font-semibold tracking-[0.16em] text-gold-700 uppercase">Fiyu Together</p>
        <span className="rounded-full border border-gold-line bg-gold-soft px-2.5 py-1 text-[0.625rem] font-semibold tracking-[0.1em] text-gold-700 uppercase">
          {summary.together_unlocked ? "Coming soon" : "Locked"}
        </span>
      </div>
      <h2 id="together-title" className="mt-3 font-display text-2xl text-ink">Taste is better shared.</h2>
      <p className="mt-3 text-sm leading-6 text-ink-body">
        Three extra Picks, chosen for you and someone else.
      </p>
      {!summary.together_unlocked ? <div className="mt-5"><Progress summary={summary} context="together" /></div> : null}
    </section>
  );
}

export function YourFiyuPage() {
  const identity = useProfileIdentity();
  const accountId = identity.status === "loading" ? undefined : identity.profile?.user_id ?? null;
  const loadSummary = useCallback(() => fetchUserFiyuSummary(), []);
  const summary = useAccountQuery<UserFiyuSummary>({
    resource: "user-fiyu-summary",
    accountId,
    loader: loadSummary,
    enabled: Boolean(accountId),
    maxAgeMs: 60_000,
  });
  const setSummary = summary.setData;
  const acknowledgeTaste = useCallback(async (milestone: number) => {
    await acknowledgeTasteUpdate(milestone);
    setSummary((current) => ({ ...current!, taste_has_unseen_update: false }));
  }, [setSummary]);

  if (identity.status === "loading" || (accountId && summary.status === "loading")) {
    return <main className="flex-1"><FiyuLoadingScreen contained className="min-h-[60dvh]" /></main>;
  }

  if (!accountId || !identity.profile) {
    return (
      <main className="flex flex-1 items-center justify-center px-5 py-16">
        <div className="max-w-md text-center">
          <p className="text-xs font-semibold tracking-[0.16em] text-lavender-700 uppercase">Your Fiyu</p>
          <h1 className="mt-3 font-display text-4xl text-ink">Sign in to see your Fiyu.</h1>
          <Link href="/signin?next=/profile" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-lavender-600 px-5 text-sm font-medium text-white">Sign in</Link>
        </div>
      </main>
    );
  }

  if (summary.status === "error") {
    return (
      <main className="flex flex-1 items-center justify-center px-5 py-16 text-center">
        <div><h1 className="font-display text-4xl text-ink">Your Fiyu</h1><p className="mt-3 text-sm text-ink-muted">Your account summary is unavailable right now.</p></div>
      </main>
    );
  }

  if (summary.status !== "ready") return null;

  const presentation = profileIdentityPresentation(identity);
  return (
    <main className="flex-1 px-5 pt-8 pb-[calc(var(--spacing-mobile-nav)+2rem)] sm:px-8 lg:py-12 lg:pb-16">
      <div className="mx-auto w-full max-w-6xl">
        <header className="pb-8">
          <div className="flex items-start justify-between gap-5">
            <div className="flex min-w-0 items-center gap-4 sm:gap-5">
              <ProfileIdentityAvatar identity={identity} className="h-20 w-20 text-2xl sm:h-24 sm:w-24 sm:text-3xl" />
              <div className="min-w-0">
                <p className="text-[0.6875rem] font-semibold tracking-[0.16em] text-lavender-700 uppercase">Your Fiyu</p>
                <h1 className="mt-1 truncate font-display text-3xl text-ink sm:text-4xl">{presentation.label}</h1>
                <p className="mt-1 truncate text-sm text-ink-muted">@{identity.profile.username}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row">
              <Link href="/profile/edit" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3.5 text-sm font-medium text-ink hover:border-line-strong hover:bg-subtle">Edit profile</Link>
              <Link href="/profile/settings" className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-ink-muted hover:text-ink">Settings</Link>
            </div>
          </div>
          {identity.profile.bio ? <p className="mt-5 max-w-2xl text-sm leading-6 text-ink-body">{identity.profile.bio}</p> : null}
          <dl className="mt-7 grid grid-cols-3 divide-x divide-line border-y border-line py-4">
            {[
              ["Visited", summary.data.visited_count],
              ["Saved", summary.data.saved_count],
              ["Areas", summary.data.area_count],
            ].map(([label, value]) => (
              <div key={label} className="px-3 text-center first:pl-0 last:pr-0 sm:px-8 sm:text-left">
                <dt className="text-[0.625rem] font-semibold tracking-[0.14em] text-ink-faint uppercase">{label}</dt>
                <dd className="mt-1 font-display text-3xl text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
          <div className="space-y-6"><TasteSection key={summary.data.taste_current_milestone ?? "locked"} summary={summary.data} onAcknowledge={acknowledgeTaste} /><RecentVisits summary={summary.data} /></div>
          <div className="space-y-6 lg:sticky lg:top-[calc(var(--spacing-header)+1.5rem)]"><Together summary={summary.data} /></div>
        </div>
      </div>
    </main>
  );
}

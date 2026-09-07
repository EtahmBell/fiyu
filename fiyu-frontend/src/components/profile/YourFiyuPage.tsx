"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ProfileIdentityAvatar, profileIdentityPresentation } from "@/components/profile/ProfileIdentityAvatar";
import { FiyuLoadingScreen } from "@/components/states/FiyuLoadingScreen";
import { useAccountQuery } from "@/lib/accountQueryCache";
import { acknowledgeTasteUpdate, fetchUserFiyuSummary } from "@/lib/api/client";
import type { UserFiyuSummary } from "@/lib/api/schemas";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";
import { cn } from "@/lib/utils/cn";

/**
 * Your Fiyu.
 *
 * The page is composed as a run of full-bleed bands rather than a column of
 * cards. Each band owns its own background and its own hairlines; the measure
 * lives inside them, so a band can tint or rule edge to edge while the type
 * stays on one shared column.
 *
 * Only one band is tinted. Your Taste is the reason to reopen this page, so it
 * gets the pale lavender wash and the largest display type, and everything else
 * sits on plain canvas and earns its structure from rules, gutters and
 * whitespace. Champagne appears once, at the foot, as two hairlines and a chip
 * around Fiyu Together -- past/future warmth, never a fill.
 */

/** One measure for every band, so the bleeding backgrounds never break the column. */
const MEASURE = "mx-auto w-full max-w-[74rem] px-5 sm:px-8 lg:px-12";

/** The recurring micro-caps mark. Colour is left to the caller. */
const MICRO_CAPS = "text-[0.625rem] font-semibold tracking-[0.16em] uppercase";

/**
 * The Taste reveal step.
 *
 * A new snapshot arrives one observation at a time. 140ms is far enough apart to
 * be read as separate arrivals and close enough that four of them are finished
 * inside 700ms -- the page should feel composed, not narrated.
 */
const REVEAL_STEP_MS = 140;

const REVEAL_BASE =
  "transition duration-500 ease-(--ease-fiyu) motion-reduce:translate-y-0 motion-reduce:opacity-100";

/**
 * Entrance state for one element of a Taste reveal.
 *
 * `pending` is true only on the first paint of a milestone the reader has not
 * seen. Every other visit renders the settled state directly, so an
 * acknowledged Taste is static from the first frame.
 */
function reveal(pending: boolean, delay: number) {
  return {
    className: cn(REVEAL_BASE, pending ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"),
    style: { transitionDelay: `${delay}ms` },
  };
}

function visitDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** A tracked label with a short rule leading into it: the mark that opens a band. */
function Eyebrow({
  children,
  tone = "lavender",
  className,
}: {
  children: React.ReactNode;
  tone?: "lavender" | "champagne";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-3",
        MICRO_CAPS,
        tone === "champagne" ? "text-gold-700" : "text-lavender-700",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("h-px w-6 shrink-0", tone === "champagne" ? "bg-gold" : "bg-lavender-500")}
      />
      {children}
    </p>
  );
}

/**
 * A rating count closing on a threshold.
 *
 * Two pixels of lavender on a neutral rule. The number is the quiet part and the
 * sentence is the loud part: this is a reason to log another visit, not a score.
 */
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
      <div className="flex items-baseline justify-between gap-5">
        <p className="max-w-[42ch] text-sm leading-6 text-ink-body">{copy}</p>
        <p className="shrink-0 font-display text-lg text-plum tabular-nums">
          {completed}/{threshold}
        </p>
      </div>
      <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div
          className="h-full rounded-full bg-lavender-500 transition-[width] duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The recurring milestone, told as part of the Taste narrative.
 *
 * A dateline-scale label, the count as a phrase rather than a fraction, and a
 * hairline that fills. The `10 → 15` figure carries the arithmetic so the
 * sentence does not have to.
 */
function TasteUpdateProgress({
  summary,
  separated,
  ...motion
}: { summary: UserFiyuSummary; separated: boolean } & ReturnType<typeof reveal>) {
  const currentFloor = summary.taste_current_milestone ?? summary.taste_unlock_threshold;
  const span = summary.taste_next_milestone - currentFloor;
  const completed = Math.max(summary.rated_visit_count - currentFloor, 0);
  const percentage = span > 0 ? Math.min((completed / span) * 100, 100) : 0;
  const remaining = summary.ratings_until_next_taste_update;
  return (
    <div
      {...motion}
      className={cn(separated && "mt-9 border-t border-line pt-6 lg:mt-10", motion.className)}
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className={cn(MICRO_CAPS, "text-ink-faint")}>Next Taste update</p>
        {/* The count as a figure, not a fraction: where the reader is, and where the
            next snapshot sits. The lavender on this block is spent on the rule below. */}
        <p className="shrink-0 font-display text-base text-plum tabular-nums">
          {`${summary.rated_visit_count} → ${summary.taste_next_milestone}`}
        </p>
      </div>
      <p className="mt-2 font-display text-2xl leading-tight text-ink">
        {remaining > 0
          ? `${remaining} more rating${remaining === 1 ? "" : "s"}`
          : "Your next update is ready"}
      </p>
      <div className="mt-4 h-0.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div className="h-full rounded-full bg-lavender-500 transition-[width] duration-300" style={{ width: `${percentage}%` }} />
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-faint">Every rating helps Fiyu understand your taste.</p>
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

/**
 * One observation, set as an editorial column.
 *
 * From `sm` the status label hangs in a left gutter and every headline starts on
 * the same axis, which is what stops four of these reading as four widgets. A
 * lavender dot marks the two statuses that mean something actually moved in this
 * snapshot; the label itself stays ink, because it is context rather than the
 * point.
 */
function TasteInsight({
  insight,
  ...motion
}: {
  insight: UserFiyuSummary["taste_insights"][number];
} & ReturnType<typeof reveal>) {
  const label = confidenceLabel(insight);
  const marked = insight.change_status === "new" || insight.change_status === "stronger";
  return (
    <li
      {...motion}
      className={cn(
        "border-t border-line py-6 first:border-t-0 first:pt-0 sm:grid sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-8",
        motion.className,
      )}
    >
      <p className={cn("flex items-center gap-2", MICRO_CAPS, "text-plum sm:pt-1.5")}>
        {marked ? <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-lavender-500" /> : null}
        {label}
      </p>
      <div className="mt-2 sm:mt-0">
        <h3 className="max-w-[30ch] font-display text-[1.375rem] leading-[1.22] tracking-[-0.01em] text-ink sm:text-2xl">
          {insight.headline}
        </h3>
        <p className="mt-2 max-w-[52ch] text-sm leading-6 text-ink-body">{insight.description}</p>
      </div>
    </li>
  );
}

/**
 * Taste, the hero band.
 *
 * Observations on the left, the summary on the right: tags first, then the next
 * milestone. On a phone the right column falls below the left, which is also the
 * intended reading order -- what Fiyu noticed, then the shorthand for it, then
 * the reason to keep logging.
 */
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

  const band = "border-y border-line bg-lavender-50/50";

  if (!summary.taste_unlocked) {
    return (
      <section className={band} aria-labelledby="taste-title">
        <div className={cn(MEASURE, "py-11 sm:py-14 lg:py-16")}>
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
            <div>
              <Eyebrow>Your Taste</Eyebrow>
              <h2
                id="taste-title"
                className="mt-4 max-w-[24ch] font-display text-[clamp(2.125rem,8vw,3.25rem)] leading-[1.02] tracking-[-0.02em] text-ink"
              >
                Your taste is taking shape.
              </h2>
              <p className="mt-4 max-w-[52ch] text-sm leading-6 text-ink-body">
                Your ratings help Fiyu recognize patterns without turning a single meal into a verdict.
              </p>
            </div>
            <div className="mt-9 border-t border-line pt-6 lg:mt-0 lg:border-t-0 lg:border-l lg:pt-2 lg:pl-12">
              <Progress summary={summary} />
            </div>
          </div>
        </div>
      </section>
    );
  }

  const pending = summary.taste_has_unseen_update && !revealed;
  const tagsDelay = summary.taste_insights.length * REVEAL_STEP_MS;

  return (
    <section className={band} aria-labelledby="taste-title">
      <div className={cn(MEASURE, "py-11 sm:py-14 lg:py-16")}>
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
          <div>
            {summary.taste_has_unseen_update ? (
              <Eyebrow className="mb-4">Your Taste just updated</Eyebrow>
            ) : null}
            <h2
              id="taste-title"
              className="font-display text-[clamp(2.375rem,9vw,3.75rem)] leading-[0.98] tracking-[-0.025em] text-ink"
            >
              Your taste
            </h2>
            <p className="mt-4 flex items-center gap-3 text-sm text-ink-muted">
              <span aria-hidden="true" className="h-px w-6 shrink-0 bg-line-strong" />
              Based on {summary.rated_visit_count} rated visit{summary.rated_visit_count === 1 ? "" : "s"}
            </p>

            {summary.taste_type ? (
              <div className="mt-8 border-l border-gold-line pl-5">
                <p className={cn(MICRO_CAPS, "text-gold-700")}>Your Fiyu type</p>
                <p className="mt-1.5 font-display text-2xl leading-tight text-ink">{summary.taste_type.name}</p>
                <p className="mt-2 max-w-[52ch] text-sm leading-6 text-ink-body">{summary.taste_type.description}</p>
              </div>
            ) : null}

            {summary.taste_insights.length > 0 ? (
              <ol className="mt-9">
                {summary.taste_insights.map((insight, index) => (
                  <TasteInsight
                    key={insight.id}
                    insight={insight}
                    {...reveal(pending, index * REVEAL_STEP_MS)}
                  />
                ))}
              </ol>
            ) : null}
          </div>

          <div className="mt-10 border-t border-line pt-7 lg:mt-0 lg:border-t-0 lg:border-l lg:pt-2 lg:pl-12">
            {summary.taste_tags.length > 0 ? (
              <div {...reveal(pending, tagsDelay)}>
                <p className={cn(MICRO_CAPS, "text-ink-faint")}>Your taste right now</p>
                {/*
                 * Descriptors, not filters. Set in the display serif and parted
                 * by lavender points so they read as a signature that changes
                 * rather than as chips somebody forgot to make tappable.
                 */}
                <ul
                  aria-label="Your Taste right now"
                  className="mt-3 flex flex-wrap items-baseline font-display text-xl leading-[1.6] text-plum"
                >
                  {summary.taste_tags.map((tag, index) => (
                    <li key={tag.key} className="flex items-baseline">
                      <span>{tag.label}</span>
                      {index < summary.taste_tags.length - 1 ? (
                        <span aria-hidden="true" className="px-2.5 text-lavender-600">·</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <TasteUpdateProgress
              summary={summary}
              separated={summary.taste_tags.length > 0}
              {...reveal(pending, tagsDelay + REVEAL_STEP_MS)}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The reader's own stars.
 *
 * Lavender for what is filled, the neutral rule tone for what is not, so five
 * glyphs read as a rating at a glance without ever looking like a review site.
 * Deliberately unlike the Fiyu Score, which is a number and never a star.
 */
function Stars({ rating }: { rating: number }) {
  return (
    <span
      aria-label={`${rating} out of 5 stars`}
      className="shrink-0 text-[0.8125rem] tracking-[0.16em] text-lavender-600"
    >
      <span aria-hidden="true">{"★".repeat(rating)}</span>
      <span aria-hidden="true" className="text-line-strong">{"☆".repeat(5 - rating)}</span>
    </span>
  );
}

/**
 * Recent visits, as a ledger.
 *
 * The rows are the structure: one hairline between each, no container. From `lg`
 * the dateline moves into a left gutter and the three fields sit on one axis --
 * a different composition rather than the phone layout stretched wide.
 */
function RecentVisits({ summary }: { summary: UserFiyuSummary }) {
  return (
    <section className={cn(MEASURE, "py-11 sm:py-14")} aria-labelledby="recent-visits-title">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="recent-visits-title" className="font-display text-[1.75rem] leading-none tracking-[-0.015em] text-ink sm:text-[2rem]">
          Recent visits
        </h2>
        <Link
          href="/log/history"
          className={cn("inline-flex min-h-11 shrink-0 items-center", MICRO_CAPS, "text-plum hover:text-lavender-700")}
        >
          View all →
        </Link>
      </div>
      {summary.recent_visits.length > 0 ? (
        <ol className="mt-5 divide-y divide-line border-t border-line">
          {summary.recent_visits.map((visit) => {
            const primaryName = visit.name_ja || visit.name_en || "Restaurant";
            const secondaryName = visit.name_ja && visit.name_en ? visit.name_en : null;
            return (
              <li
                key={visit.id || `${visit.place_id}-${visit.visited_at}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 py-5 lg:grid-cols-[10rem_minmax(0,1fr)_auto] lg:gap-x-8"
              >
                <div className="col-start-1 row-start-1 min-w-0 lg:col-start-2">
                  <Link
                    href={`/restaurants/${encodeURIComponent(visit.place_id)}`}
                    className="font-jp text-base font-semibold text-ink hover:text-lavender-700"
                  >
                    {primaryName}
                  </Link>
                  {secondaryName ? <p className="mt-0.5 truncate text-sm text-ink-muted">{secondaryName}</p> : null}
                </div>
                <div className="col-start-2 row-start-1 justify-self-end lg:col-start-3">
                  {visit.rating ? <Stars rating={visit.rating} /> : null}
                </div>
                <p className="col-span-2 col-start-1 row-start-2 mt-2 text-xs tracking-[0.04em] text-ink-faint lg:col-span-1 lg:col-start-1 lg:row-start-1 lg:mt-0">
                  {[visitDate(visit.visited_at), visit.area].filter(Boolean).join(" · ")}
                </p>
                {visit.private_note_excerpt ? (
                  <p className="col-span-2 col-start-1 row-start-3 mt-3 border-l border-gold-line pl-3 text-xs leading-5 text-ink-muted lg:col-span-2 lg:col-start-2 lg:row-start-2">
                    <span className={cn("mr-2", MICRO_CAPS, "text-gold-700")}>Private note</span>
                    {visit.private_note_excerpt}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-5 border-t border-line py-8">
          <p className="font-display text-xl text-ink">No visits logged yet</p>
          <p className="mt-2 max-w-[46ch] text-sm leading-6 text-ink-muted">
            Your most recent restaurant visits will appear here.
          </p>
          <Link href="/log" className={cn("mt-3 inline-flex min-h-11 items-center", MICRO_CAPS, "text-plum")}>
            Log a visit →
          </Link>
        </div>
      )}
    </section>
  );
}

/**
 * Fiyu Together.
 *
 * The one champagne moment on the page: two warm hairlines and a chip. Every
 * other rule here is neutral, so the change of tone is enough to set the band
 * apart without a fill, a card or a disabled grey.
 */
function Together({ summary }: { summary: UserFiyuSummary }) {
  return (
    <section className="border-y border-gold-line" aria-labelledby="together-title">
      <div className={cn(MEASURE, "py-9 sm:py-11")}>
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end lg:gap-14">
          <div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Eyebrow tone="champagne">Fiyu Together</Eyebrow>
              <span className={cn("rounded-full border border-gold-line bg-gold-soft px-2.5 py-1", MICRO_CAPS, "text-gold-700")}>
                {summary.together_unlocked ? "Coming soon" : "Locked"}
              </span>
            </div>
            <h2 id="together-title" className="mt-4 font-display text-[1.75rem] leading-tight tracking-[-0.015em] text-ink sm:text-[2rem]">
              Taste is better shared.
            </h2>
            <p className="mt-2 max-w-[46ch] text-sm leading-6 text-ink-body">
              Three extra Picks, chosen for you and someone else.
            </p>
          </div>
          {!summary.together_unlocked ? (
            <div className="mt-6 lg:mt-0"><Progress summary={summary} context="together" /></div>
          ) : null}
        </div>
      </div>
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
          <p className={cn(MICRO_CAPS, "text-lavender-700")}>Your Fiyu</p>
          <h1 className="mt-3 font-display text-4xl leading-tight text-ink">Sign in to see your Fiyu.</h1>
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
    <main className="flex-1 pb-[calc(var(--spacing-mobile-nav)+2rem)] lg:pb-20">
      {/*
       * The masthead.
       *
       * A tracked title, a rule running out to the account links, then the
       * identity beneath it -- a personal page's nameplate rather than the top of
       * an account screen. The row wraps rather than compresses, so the links
       * drop to a second line on a narrow phone instead of colliding.
       */}
      <header className={cn(MEASURE, "pt-7 pb-9 sm:pt-10 lg:pt-12")}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Eyebrow className="whitespace-nowrap">Your Fiyu</Eyebrow>
          <span aria-hidden="true" className="h-px min-w-6 flex-1 bg-line" />
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {/* Keep one literal label so its visible and accessible names agree. */}
            <Link
              href="/profile/edit"
              className={cn("inline-flex min-h-11 items-center px-2", MICRO_CAPS, "text-plum hover:text-lavender-700")}
            >
              Edit profile
            </Link>
            <span aria-hidden="true" className="h-3 w-px bg-line" />
            <Link
              href="/profile/settings"
              className={cn("inline-flex min-h-11 items-center px-2", MICRO_CAPS, "text-ink-faint hover:text-ink")}
            >
              Settings
            </Link>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 sm:mt-5 sm:gap-6">
          <ProfileIdentityAvatar identity={identity} className="h-16 w-16 text-xl sm:h-20 sm:w-20 sm:text-2xl" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-[clamp(2rem,7.5vw,3rem)] leading-[1.05] tracking-[-0.02em] text-ink">
              {presentation.label}
            </h1>
            <p className="mt-0.5 truncate text-sm text-ink-muted">@{identity.profile.username}</p>
          </div>
        </div>

        {identity.profile.bio ? (
          <p className="mt-5 max-w-[56ch] text-sm leading-6 text-ink-body">{identity.profile.bio}</p>
        ) : null}

        {/*
         * Three figures, label under number. Nothing here counts people, and
         * nothing here is a streak: the numeral leads because it is a record of
         * where the reader has been.
         */}
        <dl className="mt-7 grid grid-cols-3 gap-x-4 border-t border-line pt-5 sm:mt-9 sm:gap-x-12">
          {([
            ["Visited", summary.data.visited_count],
            ["Saved", summary.data.saved_count],
            ["Areas", summary.data.area_count],
          ] as const).map(([label, value]) => (
            <div key={label} className="flex flex-col-reverse items-start gap-1.5">
              <dt className={cn(MICRO_CAPS, "text-ink-faint")}>{label}</dt>
              <dd className="font-display text-[2.25rem] leading-none text-ink tabular-nums sm:text-[2.75rem]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <TasteSection
        key={summary.data.taste_current_milestone ?? "locked"}
        summary={summary.data}
        onAcknowledge={acknowledgeTaste}
      />
      <RecentVisits summary={summary.data} />
      <Together summary={summary.data} />
    </main>
  );
}

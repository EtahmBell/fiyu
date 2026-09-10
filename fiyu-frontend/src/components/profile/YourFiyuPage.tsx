"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ProfileIdentityAvatar, profileIdentityPresentation } from "@/components/profile/ProfileIdentityAvatar";
import { TogetherPanel } from "@/components/profile/TogetherPanel";
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
 * Tone carries the chapters. Identity sits on plain canvas, Taste on a pale
 * lavender wash, history back on canvas, Fiyu Together on a pale champagne wash
 * -- four fields, each running the full width of the screen, so a reader can see
 * where one chapter ends before reading a word of it. Inside a band the
 * structure is type, gutters and a small number of hairlines; the tone change is
 * the only boundary that needs to be visible from a scroll's distance.
 *
 * A note against `globals.css`: the champagne rules there say no fill larger
 * than a chip. This page is the deliberate exception, and only at the lowest
 * step of the ramp -- `gold-soft` at 40% over canvas, which is a tone rather
 * than a colour, and never behind a control.
 *
 * Below `sm` the bands are identical but their contents are not: at 390px four
 * observations at one size is a list rather than a hierarchy, so the first is
 * featured and the rest compress into rows. Every mobile rule is a base utility
 * restored at `sm:`, so from 640px up the composition is unchanged.
 */

/** One measure for every band, so the bleeding backgrounds never break the column. */
const MEASURE = "mx-auto w-full max-w-[74rem] px-5 sm:px-8 lg:px-12";

/** The recurring micro-caps mark. Colour is left to the caller. */
const MICRO_CAPS = "text-[0.625rem] font-semibold tracking-[0.16em] uppercase";

/**
 * The Taste reveal steps.
 *
 * The lead observation arrives first and alone, then the secondary rows follow
 * at a quicker beat, then the tags and the milestone. Four insights now finish
 * inside 500ms rather than the 700ms a flat stagger took, so the hierarchy is
 * expressed in the timing without the reveal running any longer.
 */
const FEATURED_STEP_MS = 140;
const SECONDARY_STEP_MS = 90;

function insightDelay(index: number): number {
  return index === 0 ? 0 : FEATURED_STEP_MS + (index - 1) * SECONDARY_STEP_MS;
}

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
      className={cn(separated && "mt-7 border-t border-line pt-5 sm:mt-9 sm:pt-6 lg:mt-10", motion.className)}
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className={cn(MICRO_CAPS, "text-ink-faint")}>Next Taste update</p>
        {/* The count as a figure, not a fraction: where the reader is, and where the
            next snapshot sits. The lavender on this block is spent on the rule below. */}
        <p className="shrink-0 font-display text-base text-plum tabular-nums">
          {`${summary.rated_visit_count} → ${summary.taste_next_milestone}`}
        </p>
      </div>
      <p className="mt-1.5 font-display text-xl leading-tight text-ink sm:mt-2 sm:text-2xl">
        {remaining > 0
          ? `${remaining} more rating${remaining === 1 ? "" : "s"}`
          : "Your next update is ready"}
      </p>
      <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-line sm:mt-4" aria-hidden="true">
        <div className="h-full rounded-full bg-lavender-500 transition-[width] duration-300" style={{ width: `${percentage}%` }} />
      </div>
      <p className="mt-2.5 text-xs leading-5 text-ink-faint sm:mt-3">Every rating helps Fiyu understand your taste.</p>
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
 * One observation.
 *
 * From `sm` this is an editorial column: the status label hangs in a left gutter
 * and every headline starts on the same axis, which is what stops four of these
 * reading as four widgets. A lavender dot marks the two statuses that mean
 * something actually moved in this snapshot; the label itself stays ink, because
 * it is context rather than the point.
 *
 * On a phone that even rhythm is the problem rather than the solution -- four
 * blocks of label, serif headline and paragraph is a page of prose with no way
 * in. So the lead observation keeps the block, at a size above everything under
 * it and with the status in lavender, and the rest become two-line rows: the
 * headline with its status hung to the right of it, then one tighter line of
 * supporting copy. Same three fields, same order, a third of the height.
 *
 * There is exactly one rule in the run, under the featured observation, and it
 * is the heavier `line-strong`. The secondary rows are grouped by spacing alone
 * -- a rule between each of them said "these four things are peers", which is
 * the opposite of what the run is for, and on a tinted field four evenly spaced
 * hairlines read as ruled paper.
 *
 * Every mobile rule here is a base utility with an `sm:` counterpart restoring
 * the column, so the desktop composition is untouched.
 */
function TasteInsight({
  insight,
  featured,
  secondaryLead,
  ...motion
}: {
  insight: UserFiyuSummary["taste_insights"][number];
  featured: boolean;
  /** The first secondary row, which carries the one stronger hairline. */
  secondaryLead: boolean;
} & ReturnType<typeof reveal>) {
  const label = confidenceLabel(insight);
  const marked = insight.change_status === "new" || insight.change_status === "stronger";
  return (
    <li
      {...motion}
      className={cn(
        featured
          ? "pb-4"
          : cn(
              "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3",
              /* The one rule in the run marks the change of register. Below it
                 the rows are grouped by space: a little less of it than the gap
                 the rule occupies, so the group reads as tighter than the break
                 above it. */
              secondaryLead ? "border-t border-line-strong pt-4" : "pt-5",
            ),
        "sm:grid sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-x-8 sm:gap-y-0 sm:border-t sm:border-line sm:py-6 sm:first:border-t-0 sm:first:pt-0",
        motion.className,
      )}
    >
      <p
        className={cn(
          "flex items-center gap-2",
          MICRO_CAPS,
          featured ? "text-lavender-700" : "col-start-2 row-start-1 justify-self-end text-ink-muted",
          "sm:col-start-1 sm:row-start-1 sm:justify-self-start sm:pt-1.5 sm:text-plum",
        )}
      >
        {marked ? <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-lavender-500" /> : null}
        {label}
      </p>
      <h3
        className={cn(
          "max-w-[30ch] font-display tracking-[-0.01em] text-ink",
          featured
            ? "mt-1.5 text-[1.5rem] leading-[1.15]"
            : "col-start-1 row-start-1 text-[1.0625rem] leading-[1.25]",
          "sm:col-start-2 sm:row-start-1 sm:mt-0 sm:text-2xl sm:leading-[1.22]",
        )}
      >
        {insight.headline}
      </h3>
      <p
        className={cn(
          "max-w-[52ch]",
          featured
            ? "mt-2 text-sm leading-6 text-ink-body"
            : "col-span-2 col-start-1 row-start-2 mt-1 text-[0.8125rem] leading-[1.45] text-ink-muted",
          "sm:col-span-1 sm:col-start-2 sm:row-start-2 sm:mt-2 sm:text-sm sm:leading-6 sm:text-ink-body",
        )}
      >
        {insight.description}
      </p>
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

  /*
   * The Taste chapter, tinted end to end.
   *
   * One wash from the heading to the last line of the milestone footer, at the
   * same strength on a phone as on a desktop. An earlier pass contracted it to a
   * plate behind the masthead so a long mobile section would not read as a
   * coloured screen; that fixed the field and broke the chapter, because the
   * title then belonged to the tint and the observations belonged to the page.
   * The answer was the strength of the tone, not its extent: lavender-50 at half
   * opacity over canvas is about two percent of colour -- enough to say "this is
   * all one thing" and too little to read as a panel.
   */
  const band = "border-y border-line bg-lavender-50/50";

  if (!summary.taste_unlocked) {
    return (
      <section className={band} aria-labelledby="taste-title">
        <div className={cn(MEASURE, "py-9 sm:py-14 lg:py-16")}>
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
            <div>
              <Eyebrow>Your Taste</Eyebrow>
              <h2
                id="taste-title"
                className="mt-3 max-w-[24ch] font-display text-[clamp(2.125rem,8vw,3.25rem)] leading-[1.02] tracking-[-0.02em] text-ink sm:mt-4"
              >
                Your taste is taking shape.
              </h2>
              <p className="mt-3 max-w-[52ch] text-sm leading-6 text-ink-body sm:mt-4">
                Your ratings help Fiyu recognize patterns without turning a single meal into a verdict.
              </p>
            </div>
            <div className="mt-7 border-t border-line pt-5 sm:mt-9 sm:pt-6 lg:mt-0 lg:border-t-0 lg:pt-2 lg:pl-12 lg:border-l">
              <Progress summary={summary} />
            </div>
          </div>
        </div>
      </section>
    );
  }

  const pending = summary.taste_has_unseen_update && !revealed;
  const insightCount = summary.taste_insights.length;
  const tagsDelay = insightCount > 0 ? insightDelay(insightCount - 1) + SECONDARY_STEP_MS : 0;

  return (
    <section className={band} aria-labelledby="taste-title">
      <div className={cn(MEASURE, "py-9 sm:py-14 lg:py-16")}>
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
          <div>
            {summary.taste_has_unseen_update ? (
              <Eyebrow className="mb-3 sm:mb-4">Your Taste just updated</Eyebrow>
            ) : null}
            <h2
              id="taste-title"
              className="font-display text-[clamp(2.375rem,9vw,3.75rem)] leading-[0.98] tracking-[-0.025em] text-ink"
            >
              Your taste
            </h2>
            <p className="mt-3 flex items-center gap-3 text-sm text-ink-muted sm:mt-4">
              <span aria-hidden="true" className="h-px w-6 shrink-0 bg-line-strong" />
              Based on {summary.rated_visit_count} rated visit{summary.rated_visit_count === 1 ? "" : "s"}
            </p>

            {summary.taste_type ? (
              <div className="mt-6 border-l border-gold-line pl-5 sm:mt-8">
                <p className={cn(MICRO_CAPS, "text-gold-700")}>Your Fiyu type</p>
                <p className="mt-1.5 font-display text-2xl leading-tight text-ink">{summary.taste_type.name}</p>
                <p className="mt-2 max-w-[52ch] text-sm leading-6 text-ink-body">{summary.taste_type.description}</p>
              </div>
            ) : null}

            {insightCount > 0 ? (
              <ol className="mt-6 sm:mt-9">
                {summary.taste_insights.map((insight, index) => (
                  <TasteInsight
                    key={insight.id}
                    insight={insight}
                    featured={index === 0}
                    secondaryLead={index === 1}
                    {...reveal(pending, insightDelay(index))}
                  />
                ))}
              </ol>
            ) : null}
          </div>

          {/* The two boundaries that remain inside the chapter -- summary, then
              footer -- are lighter rules than the one in the observation run,
              and carry more space above them instead. */}
          <div className="mt-8 border-t border-line pt-5 sm:mt-10 sm:pt-7 lg:mt-0 lg:border-t-0 lg:border-l lg:pt-2 lg:pl-12">
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
                  className="mt-2.5 flex flex-wrap items-baseline font-display text-lg leading-[1.55] text-plum sm:mt-3 sm:text-xl sm:leading-[1.6]"
                >
                  {summary.taste_tags.map((tag, index) => (
                    <li key={tag.key} className="flex items-baseline">
                      <span>{tag.label}</span>
                      {index < summary.taste_tags.length - 1 ? (
                        <span aria-hidden="true" className="px-2 text-lavender-600 sm:px-2.5">·</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <TasteUpdateProgress
              summary={summary}
              separated={summary.taste_tags.length > 0}
              {...reveal(pending, tagsDelay + SECONDARY_STEP_MS)}
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
      <TogetherPanel accountId={accountId} ratedVisitCount={summary.data.rated_visit_count} />
    </main>
  );
}

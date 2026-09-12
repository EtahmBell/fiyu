"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  TOGETHER_CAPS,
  TogetherAvatarStack,
  type TogetherPerson,
} from "@/components/profile/TogetherIdentity";
import { TogetherPendingInvitation } from "@/components/profile/TogetherPendingInvitation";
import { Button } from "@/components/ui/Button";
import { createTogetherInvite, fetchTogetherState } from "@/lib/api/client";
import { useAccountQuery } from "@/lib/accountQueryCache";
import type { TogetherInviteCreated, TogetherSession, TogetherState } from "@/lib/api/schemas";
import { activeTogetherSessions, formatTogetherExpiry, togetherExpiryMs, togetherPartnerKey } from "@/lib/profile/togetherLifecycle";
import { useTogetherLifecycleClock } from "@/lib/profile/useTogetherLifecycleClock";
import { cn } from "@/lib/utils/cn";

/**
 * Fiyu Together on Your Fiyu.
 *
 * Your Fiyu is the status surface: it answers "can I do this, and is anything
 * waiting for me", and hands off to the hub for the Picks themselves. So this
 * band never lists restaurants, and it stays one band rather than growing into
 * a second feature page underneath the profile.
 *
 * The band used to sit on the same champagne wash as the history above it,
 * which made Together read as one more chapter of the past. It now carries the
 * plum of the feature, and at plum-100 rather than plum-50: Recent Visits
 * directly above it is bare canvas, and at 50 the two were within a percent of
 * each other, so the chapter break a reader is supposed to see from a scroll's
 * distance was not there. One step up is enough -- Taste stays the cool
 * lavender wash, Recent Visits stays neutral, Together is the tinted one.
 *
 * Still a full-width editorial band: no card container, no shadow, and the
 * deep plum stays where it belongs, on the reveal.
 *
 * One consequence of the step up: `ink-muted` measures 4.30:1 on plum-100 and
 * fails AA at the metadata sizes used here, so small copy drawn straight onto
 * the band takes `ink-body` (7.15:1) instead. Copy inside the white card in
 * the ready state keeps `ink-muted`, which is 5.18:1 on paper.
 *
 * Every state here is the server's, restated: ratings progress, the trial, the
 * Premium lock, the cycle cap, whether an invitation is out and whether a set
 * is waiting to be revealed. Nothing is inferred and nothing is dramatised.
 */

const MEASURE = "mx-auto w-full max-w-[74rem] px-5 sm:px-8 lg:px-12";

/**
 * One entry per person, not per round.
 *
 * Rounds group by partner in the hub, and Your Fiyu has to agree with it: two
 * still-active rounds with Lianne are one Together with Lianne, so the band
 * must not draw her face twice or count her twice. The key is the existing
 * lifecycle one -- this only reads it.
 */
function partnerPeople(sessions: TogetherSession[]): TogetherPerson[] {
  return [...new Map(sessions.map((session) => [
    togetherPartnerKey(session),
    {
      displayName: session.partner?.display_name ?? "Your partner",
      avatarUrl: session.partner?.avatar_url ?? null,
    },
  ])).values()];
}

export function TogetherPanel({ accountId, ratedVisitCount = 0 }: { accountId: string; ratedVisitCount?: number }) {
  const load = useCallback(() => fetchTogetherState(), []);
  const query = useAccountQuery<TogetherState>({ resource: "together-state", accountId, loader: load, enabled: true, maxAgeMs: 30_000 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sessionStatus = query.data?.session?.status;
  const refreshTogether = query.refresh;
  const rawSessions = query.data?.current_sessions ?? [];
  const expiryNow = useTogetherLifecycleClock(
    rawSessions.map(togetherExpiryMs).filter(Number.isFinite),
    () => void refreshTogether(true).catch(() => undefined),
  );
  const activeSessions = activeTogetherSessions(rawSessions, expiryNow);

  /*
   * While an invitation is out, the thing that changes is on another person's
   * device. Your Fiyu therefore revalidates on its own -- on an interval and
   * whenever the tab is looked at again -- so accepting on one phone turns
   * this band into "ready" on the other without a visit to Picks.
   */
  useEffect(() => {
    if (sessionStatus !== "pending") return;
    const refresh = () => void refreshTogether(true).catch(() => undefined);
    const interval = window.setInterval(refresh, 5_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [refreshTogether, sessionStatus]);

  const share = async (created: TogetherInviteCreated) => {
    try {
      const nativeShare = (navigator as unknown as { share?: (data: ShareData) => Promise<void> }).share;
      if (nativeShare) await nativeShare.call(navigator, { title: "Fiyu Together", text: "Find three Fiyu Picks with me.", url: created.invite_url });
      else await navigator.clipboard.writeText(created.invite_url);
      setMessage(nativeShare ? "Invite ready to share." : "Invite link copied.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("The invite could not be shared. Try again.");
    }
  };
  const start = async () => {
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      const created = await createTogetherInvite();
      if (query.data) query.setData({ ...query.data, can_initiate: false, session: created.session });
      await share(created);
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "Together is unavailable right now."); }
    finally { setBusy(false); }
  };

  const baseState = query.data ?? {
    rated_visit_count: ratedVisitCount,
    ratings_required: 5,
    premium: false,
    trial_consumed: false,
    can_initiate: ratedVisitCount >= 5,
    block_reason: ratedVisitCount < 5 ? "ratings_required" as const : null,
    session: null,
    current_sessions: [],
    generated_session_count: 0,
    cycle_limit: 3,
  };
  const state = { ...baseState, current_sessions: activeSessions };

  const pending = state.session?.status === "pending" ? state.session : null;
  const unrevealed = state.current_sessions.find((session) => session.reveal_pending) ?? null;
  const people = partnerPeople(state.current_sessions);

  return (
    <section className="border-y border-plum-line bg-plum-100" aria-labelledby="together-title">
      <div className={cn(MEASURE, "py-9 sm:py-11")}>
        <p className={cn(TOGETHER_CAPS, "text-plum-700")}>Fiyu Together</p>
        <h2 id="together-title" className="mt-4 font-display text-[1.75rem] leading-tight text-ink sm:text-[2rem]">Taste is better shared.</h2>
        <p className="mt-2 max-w-[46ch] text-sm leading-6 text-ink-body">Three extra Picks, chosen for you and someone else.</p>

        {query.status === "loading" ? <p className="mt-6 text-sm text-ink-body">Checking availability…</p> : null}
        {query.status === "error" && ratedVisitCount >= 5 ? <p role="alert" className="mt-6 text-sm text-ink-body">Together is unavailable right now.</p> : null}

        {pending ? (
          <TogetherPendingInvitation
            className="mt-6 max-w-[34rem]"
            sessionId={pending.session_id}
            accountId={accountId}
            onResolved={async (notice) => { setMessage(notice); await query.refresh(true); }}
          />
        ) : unrevealed ? (
          /*
           * Someone accepted. This is the only state on Your Fiyu that is news
           * rather than status, so it is the only one given the pair's faces
           * and a filled action -- and it still sits inside the band rather
           * than arriving as a banner over the page.
           */
          <div className="mt-6 max-w-[34rem] rounded-card border border-plum-line bg-surface p-5 sm:p-6">
            <TogetherAvatarStack people={people} size="sm" tone="paper" ring="ring-surface" />
            <p className={cn(TOGETHER_CAPS, "mt-4 text-plum-700")}>Your Together is ready</p>
            <p className="mt-2 font-display text-xl leading-tight text-ink">
              {unrevealed.partner?.display_name ?? "Your partner"} joined.
            </p>
            <Link
              href={`/together/session/${encodeURIComponent(unrevealed.session_id)}`}
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-plum-900 px-5 text-sm font-semibold text-white transition-[background-color,transform] duration-[180ms] ease-(--ease-fiyu) hover:bg-plum active:scale-[0.98]"
            >
              Reveal our Picks →
            </Link>
            {state.can_initiate ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void start()}
                className="mt-3 block min-h-11 text-sm text-ink-muted underline decoration-plum-line underline-offset-4 transition-colors hover:text-plum-700 hover:decoration-plum-500 disabled:opacity-50"
              >
                Start another Together →
              </button>
            ) : null}
          </div>
        ) : state.current_sessions.length > 0 ? (
          /*
           * An active Together, and possibly the room to start another. Both
           * have to be reachable from here, so the only question is weight:
           * continuing what already exists is the primary path, and starting
           * another is a quieter line beneath it. Two equally heavy buttons
           * would make the reader choose before knowing what they have.
           */
          <div className="mt-6">
            <div className="flex items-center gap-3.5">
              <TogetherAvatarStack people={people} size="sm" tone="paper" ring="ring-plum-100" />
              <div className="min-w-0">
                <p className="font-display text-xl leading-tight break-words text-ink">
                  {people.length === 1
                    ? `Together with ${people[0].displayName}`
                    : `${people.length} active Togethers`}
                </p>
                {/*
                 * Metadata, not a deadline. One active round states its own
                 * expiry in the same words the hub uses, in muted ink at
                 * metadata size -- no badge, no warning colour, no icon, and
                 * never louder than the partner's name. Several rounds say
                 * nothing here; per-round expiry is the hub's job.
                 */}
                {state.current_sessions.length === 1
                  && Number.isFinite(togetherExpiryMs(state.current_sessions[0])) ? (
                  <p className="mt-1 text-xs text-ink-body">
                    {formatTogetherExpiry(togetherExpiryMs(state.current_sessions[0]), expiryNow)}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-5 flex flex-col items-start gap-1">
              <Link
                href="/together"
                className="inline-flex min-h-11 items-center rounded-lg border border-plum-500/40 bg-surface px-4 text-sm font-semibold text-plum-700 transition-colors duration-[180ms] ease-(--ease-fiyu) hover:border-plum-500 hover:bg-plum-50"
              >
                View Together →
              </Link>
              {state.can_initiate ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void start()}
                  className="inline-flex min-h-11 items-center text-sm text-ink-body underline decoration-plum-line underline-offset-4 transition-colors hover:text-plum-700 hover:decoration-plum-500 disabled:opacity-50"
                >
                  Start another Together →
                </button>
              ) : null}
            </div>
          </div>
        ) : state.block_reason === "ratings_required" ? (
          <p className="mt-6 text-sm leading-6 text-ink-body">Rate {Math.max(state.ratings_required - state.rated_visit_count, 0)} more visit{state.ratings_required - state.rated_visit_count === 1 ? "" : "s"} to unlock Fiyu Together.</p>
        ) : state.block_reason === "premium_required" ? (
          <p className="mt-6 font-display text-xl text-ink">Available with Fiyu Premium</p>
        ) : state.block_reason === "cycle_limit_reached" ? (
          <p className="mt-6 text-sm text-ink-body">You have reached this cycle&apos;s Together limit.</p>
        ) : state.can_initiate && query.status !== "error" ? (
          <div className="mt-6">
            <Button variant="secondary" disabled={busy} onClick={() => void start()}>{state.premium ? "Start a Together" : "Start your first Together"}</Button>
            {!state.premium ? <p className="mt-3 text-xs text-ink-body">Your first Together is included.</p> : null}
          </div>
        ) : null}

        {message ? <p role="status" className="mt-4 text-xs text-ink-body">{message}</p> : null}
      </div>
    </section>
  );
}

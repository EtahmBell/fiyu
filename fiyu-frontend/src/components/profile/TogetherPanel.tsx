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
import { activeTogetherSessions, formatTogetherExpiry, togetherExpiryMs } from "@/lib/profile/togetherLifecycle";
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
 * which made Together read as one more chapter of the past. It is now the pale
 * plum of the feature -- the same ground as the Picks entry and the hub's
 * content area -- so the page's last chapter is visibly a different tense from
 * the ones before it.
 *
 * Every state here is the server's, restated: ratings progress, the trial, the
 * Premium lock, the cycle cap, whether an invitation is out and whether a set
 * is waiting to be revealed. Nothing is inferred and nothing is dramatised.
 */

const MEASURE = "mx-auto w-full max-w-[74rem] px-5 sm:px-8 lg:px-12";

function partnerPeople(sessions: TogetherSession[]): TogetherPerson[] {
  return sessions.map((session) => ({
    displayName: session.partner?.display_name ?? "Your partner",
    avatarUrl: session.partner?.avatar_url ?? null,
  }));
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
    <section className="border-y border-plum-line bg-plum-50" aria-labelledby="together-title">
      <div className={cn(MEASURE, "py-9 sm:py-11")}>
        <p className={cn(TOGETHER_CAPS, "text-plum-700")}>Fiyu Together</p>
        <h2 id="together-title" className="mt-4 font-display text-[1.75rem] leading-tight text-ink sm:text-[2rem]">Taste is better shared.</h2>
        <p className="mt-2 max-w-[46ch] text-sm leading-6 text-ink-body">Three extra Picks, chosen for you and someone else.</p>

        {query.status === "loading" ? <p className="mt-6 text-sm text-ink-muted">Checking availability…</p> : null}
        {query.status === "error" && ratedVisitCount >= 5 ? <p role="alert" className="mt-6 text-sm text-ink-muted">Together is unavailable right now.</p> : null}

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
            <TogetherAvatarStack people={people} size="sm" ring="ring-surface" />
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
              <Button className="mt-3 sm:ml-3 sm:mt-5" variant="secondary" size="sm" disabled={busy} onClick={() => void start()}>
                Start another
              </Button>
            ) : null}
          </div>
        ) : state.current_sessions.length > 0 ? (
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            <TogetherAvatarStack people={people} size="sm" />
            <p className="font-display text-xl text-ink">
              {state.current_sessions.length === 1
                ? `Together with ${people[0].displayName}`
                : `${state.current_sessions.length} active Togethers`}
            </p>
            {state.current_sessions.length === 1 && Number.isFinite(togetherExpiryMs(state.current_sessions[0])) ? (
              <p className="w-full text-xs text-ink-muted">
                {formatTogetherExpiry(togetherExpiryMs(state.current_sessions[0]), expiryNow)}
              </p>
            ) : null}
            <div className="flex w-full flex-wrap items-center gap-4">
              <Link href="/together" className="inline-flex min-h-11 items-center text-sm font-semibold text-plum-700 underline decoration-plum-line underline-offset-4 hover:decoration-plum-500">View Together →</Link>
              {state.can_initiate ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => void start()}>Start another</Button> : null}
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
            {!state.premium ? <p className="mt-3 text-xs text-ink-muted">Your first Together is included.</p> : null}
          </div>
        ) : null}

        {message ? <p role="status" className="mt-4 text-xs text-ink-muted">{message}</p> : null}
      </div>
    </section>
  );
}

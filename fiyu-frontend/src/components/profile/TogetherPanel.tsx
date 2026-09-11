"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { cancelTogetherInvite, createTogetherInvite, fetchTogetherState, rotateTogetherInvite } from "@/lib/api/client";
import { invalidateTogetherSurfaces, useAccountQuery } from "@/lib/accountQueryCache";
import type { TogetherInviteCreated, TogetherState } from "@/lib/api/schemas";

export function TogetherPanel({ accountId, ratedVisitCount = 0 }: { accountId: string; ratedVisitCount?: number }) {
  const load = useCallback(() => fetchTogetherState(), []);
  const query = useAccountQuery<TogetherState>({ resource: "together-state", accountId, loader: load, enabled: true, maxAgeMs: 30_000 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sessionStatus = query.data?.session?.status;
  const refreshTogether = query.refresh;

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

  const applyInvite = (created: TogetherInviteCreated) => {
    if (query.data) query.setData({ ...query.data, can_initiate: false, session: created.session });
  };
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
    try { const created = await createTogetherInvite(); applyInvite(created); await share(created); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Together is unavailable right now."); }
    finally { setBusy(false); }
  };
  const reshare = async () => {
    const session = query.data?.session;
    if (!session || busy) return;
    setBusy(true); setMessage(null);
    try { const created = await rotateTogetherInvite(session.session_id); applyInvite(created); await share(created); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The invite could not be shared."); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    const session = query.data?.session;
    if (!session || busy) return;
    setBusy(true); setMessage(null);
    try { await cancelTogetherInvite(session.session_id); invalidateTogetherSurfaces(accountId); await query.refresh(true); setMessage("Invitation cancelled. Your trial was not used."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The invite could not be cancelled."); }
    finally { setBusy(false); }
  };

  const state = query.data ?? {
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
  return (
    <section className="border-y border-gold-line bg-gold-soft/40" aria-labelledby="together-title">
      <div className="mx-auto w-full max-w-[74rem] px-5 py-9 sm:px-8 sm:py-11 lg:px-12">
        <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-gold-700 uppercase">Fiyu Together</p>
        <h2 id="together-title" className="mt-4 font-display text-[1.75rem] leading-tight text-ink sm:text-[2rem]">Taste is better shared.</h2>
        <p className="mt-2 max-w-[46ch] text-sm leading-6 text-ink-body">Three extra Picks, chosen for you and someone else.</p>
        {query.status === "loading" ? <p className="mt-6 text-sm text-ink-muted">Checking availability…</p> : null}
        {query.status === "error" && ratedVisitCount >= 5 ? <p role="alert" className="mt-6 text-sm text-ink-muted">Together is unavailable right now.</p> : null}
        {state?.session?.status === "pending" ? (
          <div className="mt-6"><p className="font-display text-xl text-ink">Waiting for someone to join</p><div className="mt-4 flex flex-wrap gap-3"><Button variant="secondary" size="sm" disabled={busy} onClick={() => void reshare()}>Share invite</Button><button type="button" disabled={busy} onClick={() => void cancel()} className="min-h-11 px-2 text-sm text-ink-muted underline underline-offset-4">Cancel</button></div></div>
        ) : state.current_sessions.length > 0 ? (
          <div className="mt-6">
            <p className="font-display text-xl text-ink">
              {state.current_sessions.length === 1
                ? state.current_sessions[0].reveal_pending
                  ? "Your Together is ready"
                  : `Together with ${state.current_sessions[0].partner?.display_name ?? "your partner"}`
                : `${state.current_sessions.length} active Togethers`}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <Link href="/together" className="inline-flex min-h-11 items-center text-sm font-semibold text-gold-700">View Together →</Link>
              {state.can_initiate ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => void start()}>Start another</Button> : null}
            </div>
            {state.current_sessions.some((session) => session.reveal_pending) ? (
              <Link href={`/together/session/${encodeURIComponent(state.current_sessions.find((session) => session.reveal_pending)!.session_id)}`} className="mt-2 inline-flex min-h-11 items-center text-sm text-ink-muted">A shared set is ready to reveal →</Link>
            ) : null}
          </div>
        ) : state?.block_reason === "ratings_required" ? (
          <p className="mt-6 text-sm leading-6 text-ink-body">Rate {Math.max(state.ratings_required - state.rated_visit_count, 0)} more visit{state.ratings_required - state.rated_visit_count === 1 ? "" : "s"} to unlock Fiyu Together.</p>
        ) : state?.block_reason === "premium_required" ? (
          <p className="mt-6 font-display text-xl text-ink">Available with Fiyu Premium</p>
        ) : state?.block_reason === "cycle_limit_reached" ? (
          <p className="mt-6 text-sm text-ink-body">You have reached this cycle&apos;s Together limit.</p>
        ) : state?.can_initiate && query.status !== "error" ? (
          <div className="mt-6"><Button variant="secondary" disabled={busy} onClick={() => void start()}>{state.premium ? "Start a Together" : "Start your first Together"}</Button>{!state.premium ? <p className="mt-2 text-xs text-ink-muted">Your first completed Together is included.</p> : null}</div>
        ) : null}
        {message ? <p role="status" className="mt-4 text-xs text-ink-muted">{message}</p> : null}
      </div>
    </section>
  );
}

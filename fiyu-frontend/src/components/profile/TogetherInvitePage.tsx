"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { acceptTogetherInvite, fetchTogetherInvite } from "@/lib/api/client";
import type { TogetherInvitePreview } from "@/lib/api/schemas";
import { invalidateTogetherSurfaces } from "@/lib/accountQueryCache";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";

export function TogetherInvitePage({ token, autoJoin = false }: { token: string; autoJoin?: boolean }) {
  const router = useRouter();
  const identity = useProfileIdentity();
  const [preview, setPreview] = useState<TogetherInvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const resumed = useRef(false);
  const accountId = identity.profile?.user_id;

  useEffect(() => {
    let active = true;
    fetchTogetherInvite(token).then((value) => { if (active) setPreview(value); })
      .catch(() => { if (active) setError("This invitation is unavailable."); });
    return () => { active = false; };
  }, [token]);

  const next = `/together/${encodeURIComponent(token)}`;
  const joinNext = `${next}?join=1`;
  const join = useCallback(async () => {
    if (joining) return;
    setJoining(true); setError(null);
    try {
      const session = await acceptTogetherInvite(token);
      if (accountId) invalidateTogetherSurfaces(accountId);
      router.replace(`/together/session/${encodeURIComponent(session.session_id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This invitation could not be accepted.");
    } finally { setJoining(false); }
  }, [accountId, joining, router, token]);

  useEffect(() => {
    if (!autoJoin || resumed.current || identity.status !== "ready" || !identity.profile || preview?.status !== "pending" || preview.is_own_invite) return;
    resumed.current = true;
    void join();
  }, [autoJoin, identity.profile, identity.status, join, preview]);

  const unavailable = preview && preview.status !== "pending";
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <section className="w-full max-w-lg rounded-card border border-gold-line bg-surface p-7 text-center sm:p-10" aria-labelledby="together-invite-title">
        <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-gold-700 uppercase">Fiyu Together</p>
        {!preview && !error ? <p className="mt-6 text-sm text-ink-muted">Opening invitation…</p> : null}
        {preview?.status === "pending" && preview.is_own_invite ? (
          <>
            <h1 id="together-invite-title" className="mt-5 font-display text-3xl leading-tight text-ink">This is your own Fiyu Together invite.</h1>
            <p className="mt-3 text-sm leading-6 text-ink-muted">You’ll need to send it to someone else to continue.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(window.location.href)}>Copy invite link</Button>
              <Link href="/profile" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-plum">Return to Fiyu</Link>
            </div>
          </>
        ) : preview?.status === "pending" ? (
          <>
            <h1 id="together-invite-title" className="mt-5 font-display text-3xl leading-tight text-ink">{preview.initiator?.display_name ?? "Someone"} wants to find somewhere with you.</h1>
            <p className="mt-3 text-sm leading-6 text-ink-muted">Three Picks, chosen for both of you.</p>
            {identity.status === "ready" && identity.profile ? (
              <Button className="mt-7" disabled={joining} onClick={() => void join()}>Join {preview.initiator?.display_name ?? "Together"}</Button>
            ) : identity.status === "ready" ? (
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link href={`/signin?next=${encodeURIComponent(joinNext)}`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-plum px-5 text-sm font-medium text-white">Sign in to join</Link>
                <Link href={`/signup?next=${encodeURIComponent(joinNext)}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-5 text-sm font-medium text-ink">Create account</Link>
                <Link href={`/signin?next=${encodeURIComponent(next)}`} className="inline-flex min-h-11 items-center justify-center px-3 text-xs text-ink-muted underline underline-offset-4">Sign in without joining yet</Link>
              </div>
            ) : null}
          </>
        ) : null}
        {unavailable ? <><h1 id="together-invite-title" className="mt-5 font-display text-3xl text-ink">This invitation is no longer available.</h1><p className="mt-3 text-sm text-ink-muted">Ask for a new Fiyu Together link.</p></> : null}
        {error ? <p role="alert" className="mt-6 text-sm text-rose-dust">{error}</p> : null}
      </section>
    </main>
  );
}

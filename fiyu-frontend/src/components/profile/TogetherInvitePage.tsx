"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  TOGETHER_CAPS,
  TogetherAvatar,
  TogetherAwaitingMark,
  usePrefersReducedMotion,
} from "@/components/profile/TogetherIdentity";
import { acceptTogetherInvite, fetchTogetherInvite } from "@/lib/api/client";
import type { TogetherInvitePreview } from "@/lib/api/schemas";
import { invalidateTogetherSurfaces } from "@/lib/accountQueryCache";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";
import { cn } from "@/lib/utils/cn";

/**
 * The Fiyu Together invitation.
 *
 * Often the first Fiyu screen a person ever sees, arriving from a message
 * thread with no idea what Fiyu is. It answers three things and stops: who
 * sent this, what happens if I accept, and how do I accept. It is not a
 * landing page -- there is no feature tour, no pricing and no second call to
 * action, because a recipient standing outside a restaurant with a friend is
 * not shopping for an app.
 *
 * The deep plum ground is shared with the reveal, and only with the reveal:
 * both are moments that belong to the pair rather than to one account, and a
 * recipient who accepts here will recognise the same surface when the Picks
 * arrive.
 */

export function TogetherInvitePage({ token, autoJoin = false }: { token: string; autoJoin?: boolean }) {
  const router = useRouter();
  const identity = useProfileIdentity();
  const reducedMotion = usePrefersReducedMotion();
  const [preview, setPreview] = useState<TogetherInvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
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

  /*
   * The initiator's own link. No rotation and no new token: this shares the
   * page the user is already on, which is the same invitation they were
   * handed.
   */
  const shareOwnInvite = async () => {
    const url = window.location.href;
    const nativeShare = (navigator as unknown as { share?: (data: ShareData) => Promise<void> }).share;
    try {
      if (nativeShare) {
        await nativeShare.call(navigator, { title: "Fiyu Together", text: "Find three Fiyu Picks with me.", url });
        setShareMessage("Invite ready to share.");
      } else {
        await navigator.clipboard.writeText(url);
        setShareMessage("Invite link copied.");
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setShareMessage("The invite could not be shared. Try again.");
    }
  };

  const initiatorName = preview?.initiator?.display_name ?? "Someone";
  const unavailable = preview && preview.status !== "pending";
  const entrance = (delayMs: number) =>
    reducedMotion ? undefined : { animation: `fiyu-reveal-in 400ms var(--ease-fiyu) ${delayMs}ms both` };

  return (
    // The plum fills whatever the public shell leaves between its header and
    // its footer, rather than adding a viewport of its own beneath them.
    <main className="flex min-h-[60dvh] flex-1 flex-col items-center justify-center bg-plum-900 px-6 py-16 text-center">
      <section className="w-full max-w-sm" aria-labelledby="together-invite-title">
        <p className={cn(TOGETHER_CAPS, "text-plum-mist")}>Fiyu Together</p>

        {!preview && !error ? (
          <p className="mt-8 text-sm text-plum-mist">Opening invitation…</p>
        ) : null}

        {preview?.status === "pending" && preview.is_own_invite ? (
          /*
           * The initiator opening their own link. Nothing has gone wrong, so
           * nothing is drawn in red: the pair is simply still one person, and
           * the page's job becomes handing the link on.
           */
          <>
            <div className="mt-8 flex items-center justify-center gap-4">
              <TogetherAvatar
                person={{ displayName: initiatorName, avatarUrl: preview.initiator?.avatar_url }}
                size="md"
                tone="deep"
              />
              <span aria-hidden="true" className="h-px w-8 border-t border-dashed border-white/35" />
              <TogetherAwaitingMark size="md" tone="deep" />
            </div>
            <h1 id="together-invite-title" className="mt-7 font-display text-[1.75rem] leading-tight text-white">
              This is your own Fiyu Together invite.
            </h1>
            <p className="mt-3 text-sm leading-6 text-plum-mist">
              Send it to someone else to get started.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => void shareOwnInvite()}
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-white px-6 text-sm font-semibold text-plum-900 transition-[background-color,transform] duration-[180ms] ease-(--ease-fiyu) hover:bg-plum-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Share invite
              </button>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => setShareMessage("Invite link copied."))}
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/30 px-6 text-sm font-medium text-white transition-colors hover:border-white/60"
              >
                Copy invite link
              </button>
              <Link
                href="/profile"
                className="inline-flex min-h-11 items-center justify-center px-3 text-sm text-plum-mist underline underline-offset-4"
              >
                Return to Fiyu
              </Link>
            </div>
            {shareMessage ? (
              <p role="status" className="mt-5 text-xs text-plum-mist">{shareMessage}</p>
            ) : null}
          </>
        ) : preview?.status === "pending" ? (
          <>
            <div className="mt-9 flex justify-center" style={entrance(0)}>
              <TogetherAvatar
                person={{ displayName: initiatorName, avatarUrl: preview.initiator?.avatar_url }}
                size="lg"
                tone="deep"
              />
            </div>
            <h1
              id="together-invite-title"
              className="mt-7 font-display text-[clamp(1.75rem,7.5vw,2.25rem)] leading-[1.15] break-words text-balance text-white"
              style={entrance(160)}
            >
              {initiatorName} wants to find somewhere with you.
            </h1>
            <p className="mt-4 text-sm leading-6 text-plum-mist" style={entrance(280)}>
              Three Picks, chosen for both of you.
            </p>

            <div style={entrance(400)}>
              {identity.status === "ready" && identity.profile ? (
                <button
                  type="button"
                  disabled={joining}
                  onClick={() => void join()}
                  className="mt-9 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-white px-7 text-sm font-semibold text-plum-900 transition-[background-color,transform] duration-[180ms] ease-(--ease-fiyu) hover:bg-plum-50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  {joining ? "Joining…" : `Join ${initiatorName}`}
                </button>
              ) : identity.status === "ready" ? (
                <div className="mt-9 flex flex-col gap-3">
                  <Link href={`/signin?next=${encodeURIComponent(joinNext)}`} className="inline-flex min-h-12 items-center justify-center rounded-lg bg-white px-6 text-sm font-semibold text-plum-900 hover:bg-plum-50">Sign in to join</Link>
                  <Link href={`/signup?next=${encodeURIComponent(joinNext)}`} className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/30 px-6 text-sm font-medium text-white transition-colors hover:border-white/60">Create account</Link>
                  <Link href={`/signin?next=${encodeURIComponent(next)}`} className="inline-flex min-h-11 items-center justify-center px-3 text-xs text-plum-mist underline underline-offset-4">Sign in without joining yet</Link>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {unavailable ? (
          <>
            <h1 id="together-invite-title" className="mt-8 font-display text-[1.75rem] leading-tight text-white">
              This invitation is no longer available.
            </h1>
            <p className="mt-3 text-sm leading-6 text-plum-mist">Ask for a new Fiyu Together link.</p>
            <Link href="/picks" className="mt-8 inline-flex min-h-11 items-center justify-center px-3 text-sm text-plum-mist underline underline-offset-4">
              Go to Fiyu
            </Link>
          </>
        ) : null}

        {error ? <p role="alert" className="mt-7 text-sm text-rose-dust">{error}</p> : null}
      </section>
    </main>
  );
}

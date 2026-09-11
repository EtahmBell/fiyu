"use client";

import { useState } from "react";

import { TogetherAwaitingMark } from "@/components/profile/TogetherIdentity";
import { Button } from "@/components/ui/Button";
import { cancelTogetherInvite, rotateTogetherInvite } from "@/lib/api/client";
import { invalidateTogetherSurfaces } from "@/lib/accountQueryCache";
import type { TogetherInviteCreated } from "@/lib/api/schemas";
import { cn } from "@/lib/utils/cn";

/**
 * Waiting for someone to join.
 *
 * The state Together spends the most wall-clock time in, and the one most
 * easily mistaken for a failure. Nothing is loading here -- the request
 * finished, the link exists, and the product is waiting on a second person --
 * so there is no spinner and no progress. The mark is an empty seat on a
 * dashed connection, breathing once every four seconds, and the copy says who
 * is being waited on rather than what the app is doing.
 *
 * Shared by the hub and by Your Fiyu so the two surfaces cannot drift: both
 * call the same rotate and cancel endpoints with the same semantics, and the
 * cancellation message keeps saying, truthfully, that the trial was not spent.
 */

export function TogetherPendingInvitation({
  sessionId,
  accountId,
  onResolved,
  className,
}: {
  sessionId: string;
  accountId?: string | null;
  /**
   * Called after a cancellation, with the notice to show.
   *
   * The owning surface both refetches and reports: cancelling removes the
   * pending session, which unmounts this component, so a confirmation held
   * here would disappear with it -- and the one thing the reader needs to be
   * told is that the trial was not spent.
   */
  onResolved: (notice: string) => void | Promise<unknown>;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const share = async (created: TogetherInviteCreated) => {
    const nativeShare = (navigator as unknown as { share?: (data: ShareData) => Promise<void> }).share;
    if (nativeShare) {
      await nativeShare.call(navigator, {
        title: "Fiyu Together",
        text: "Find three Fiyu Picks with me.",
        url: created.invite_url,
      });
    } else {
      await navigator.clipboard.writeText(created.invite_url);
    }
    setMessage(nativeShare ? "Invite ready to share." : "Invite link copied.");
  };

  const reshare = async () => {
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      await share(await rotateTogetherInvite(sessionId));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "The invite could not be shared.");
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      await cancelTogetherInvite(sessionId);
      if (accountId) invalidateTogetherSurfaces(accountId);
      await onResolved("Invitation cancelled. Your trial was not used.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invite could not be cancelled.");
    } finally { setBusy(false); }
  };

  return (
    <div className={cn("rounded-card border border-plum-line bg-surface/70 p-5 sm:p-6", className)}>
      {/*
       * You, a dashed line, and the seat nobody has taken yet. The dash is the
       * whole idea: a solid connector would claim a pair that does not exist.
       */}
      <span aria-hidden="true" className="flex items-center gap-2.5">
        <span className="size-2.5 shrink-0 rounded-full bg-plum-500" />
        <span className="h-px w-9 shrink-0 border-t border-dashed border-plum-500/55" />
        <TogetherAwaitingMark size="sm" />
      </span>

      <p className="mt-4 font-display text-xl leading-tight text-ink">
        Waiting for someone to join
      </p>
      <p className="mt-1.5 text-sm leading-6 text-ink-muted">
        Your Together starts as soon as they open the invite.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void reshare()}>
          Share invite
        </Button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void cancel()}
          className="min-h-11 px-1 text-sm text-ink-muted underline decoration-plum-line underline-offset-4 hover:text-plum-700 hover:decoration-plum-500 disabled:opacity-50"
        >
          Cancel invitation
        </button>
      </div>

      {message ? (
        <p role="status" className="mt-4 text-xs leading-5 text-ink-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}

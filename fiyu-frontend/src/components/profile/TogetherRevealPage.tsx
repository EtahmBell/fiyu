"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  TOGETHER_CAPS,
  TogetherPairMark,
  usePrefersReducedMotion,
  type TogetherPerson,
} from "@/components/profile/TogetherIdentity";
import { fetchTogetherSession, revealTogetherSession } from "@/lib/api/client";
import type { TogetherSession } from "@/lib/api/schemas";
import { invalidateTogetherSurfaces } from "@/lib/accountQueryCache";
import { markTogetherRevealArrival } from "@/lib/profile/togetherRevealArrival";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";
import { cn } from "@/lib/utils/cn";

/**
 * The one-time Fiyu Together reveal.
 *
 * This is the only full deep-plum screen in the product, and it exists for a
 * single sentence: Fiyu found three places for the two of you. Everything on it
 * is in service of that sentence -- two faces, both names, one action -- and
 * nothing else competes: no navigation, no partner switching, no restaurant
 * content, and no count-up, progress bar or simulated search. The Picks already
 * exist on the server; the only thing that has not happened yet is this
 * participant looking at them.
 *
 * The sequence deliberately ends somewhere else. The reveal screen carries the
 * moment before, the hub carries the Picks, and the transition between them is
 * the reveal. That keeps one home for a Together set instead of two, and means
 * the three restaurants are never drawn twice.
 *
 * Reveal semantics are untouched: the identities arrive only in the response to
 * the POST, the partner's own reveal state is not affected, and a failure
 * leaves the screen exactly where it was with a plain message.
 */

/** Entrance beats, in ms. Fast enough to feel composed rather than staged. */
const HEADING_DELAY = 220;
const LEAD_DELAY = 380;
const ACTION_DELAY = 520;

/**
 * Small counts are set as words on this screen.
 *
 * "Three places chosen for both of you" is a sentence; "3 places" is a
 * quantity, and this is the one surface in Together where the set is being
 * described rather than listed. The numeral is still what the hub uses.
 */
const COUNT_WORDS = ["No", "One", "Two", "Three"] as const;

function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

function entrance(delayMs: number, reducedMotion: boolean) {
  if (reducedMotion) return undefined;
  return { animation: `fiyu-reveal-in 420ms var(--ease-fiyu) ${delayMs}ms both` };
}

export function TogetherRevealPage({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const identity = useProfileIdentity();
  const reducedMotion = usePrefersReducedMotion();
  const [session, setSession] = useState<TogetherSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountId = identity.profile?.user_id;
  const participantName = identity.profile?.display_name ?? identity.profile?.username ?? "You";

  useEffect(() => {
    let active = true;
    fetchTogetherSession(sessionId)
      .then((value) => {
        if (!active) return;
        setSession(value);
        if (!value.reveal_pending) router.replace(`/together?session=${encodeURIComponent(sessionId)}`);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Together is unavailable.");
      });
    return () => { active = false; };
  }, [router, sessionId]);

  const reveal = useCallback(async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await revealTogetherSession(sessionId);
      if (accountId) invalidateTogetherSurfaces(accountId);
      // The hub stages the three cards; this is the only thing that tells it
      // the arrival is the end of a reveal rather than an ordinary visit.
      markTogetherRevealArrival(sessionId);
      router.replace(`/together?session=${encodeURIComponent(sessionId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Together could not be revealed.");
      setBusy(false);
    }
  }, [accountId, busy, router, sessionId]);

  const partnerName = session?.partner?.display_name ?? "your partner";
  const pair: TogetherPerson[] = [
    { displayName: participantName, avatarUrl: identity.profileImage },
    { displayName: partnerName, avatarUrl: session?.partner?.avatar_url ?? null },
  ];

  return (
    /*
     * The ground bleeds past the shell rather than sitting in a card. A plum
     * panel on the canvas would have read as another module on another page;
     * the screen has to be the surface for the moment to land.
     */
    <main className="flex min-h-[calc(100dvh-var(--spacing-header))] flex-1 flex-col items-center justify-center bg-plum-900 px-6 pt-14 pb-[calc(var(--spacing-mobile-nav)+2rem)] text-center lg:pb-20">
      <section className="w-full max-w-md" aria-labelledby="together-ready-title">
        <p className={cn(TOGETHER_CAPS, "text-plum-mist")}>Fiyu Together</p>

        {session?.reveal_pending ? (
          <>
            <div className="mt-9 flex justify-center" style={entrance(0, reducedMotion)}>
              <TogetherPairMark people={pair} size="lg" tone="deep" animate />
            </div>

            {/*
             * Both names at one weight. The heading is the pair, so it is the
             * one place in Together where two people are named as a unit.
             */}
            {/*
             * Display names are user-supplied and can be long, so the pair
             * line wraps and breaks rather than running off a 390px screen.
             */}
            <h1
              id="together-ready-title"
              className="mt-7 font-display text-[1.75rem] leading-tight break-words text-balance text-white sm:text-[2rem]"
              style={entrance(HEADING_DELAY, reducedMotion)}
            >
              <span className="block">
                {participantName} <span className="text-plum-mist">×</span> {partnerName}
              </span>
            </h1>

            <p
              className="mt-6 font-display text-[clamp(1.875rem,8vw,2.5rem)] leading-[1.15] text-white"
              style={entrance(LEAD_DELAY, reducedMotion)}
            >
              Your Fiyu Together
              <br />
              is ready.
            </p>
            <p
              className="mt-4 text-sm leading-6 text-plum-mist"
              style={entrance(LEAD_DELAY, reducedMotion)}
            >
              {countWord(session.pick_count)} {session.pick_count === 1 ? "place" : "places"} chosen
              for both of you.
            </p>

            <div className="mt-10" style={entrance(ACTION_DELAY, reducedMotion)}>
              {/*
               * One action, and it is not the app's lavender primary: on this
               * ground the Together button is white on plum, which is both the
               * highest contrast available and unmistakably this feature's.
               */}
              <button
                type="button"
                disabled={busy}
                onClick={() => void reveal()}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-white px-7 text-sm font-semibold text-plum-900 transition-[background-color,transform] duration-[180ms] ease-(--ease-fiyu) hover:bg-plum-50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:w-auto"
              >
                {busy ? "Revealing…" : "Reveal our Picks"}
              </button>
            </div>
          </>
        ) : !error ? (
          <p className="mt-8 text-sm text-plum-mist">Opening your Together…</p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-8 text-sm text-rose-dust">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}

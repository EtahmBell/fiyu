"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { fetchTogetherSession, revealTogetherSession } from "@/lib/api/client";
import type { TogetherSession } from "@/lib/api/schemas";
import { invalidateTogetherSurfaces } from "@/lib/accountQueryCache";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";

export function TogetherRevealPage({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const identity = useProfileIdentity();
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
        if (!value.reveal_pending) router.replace("/picks#together-picks");
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
      router.replace("/picks#together-picks");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Together could not be revealed.");
      setBusy(false);
    }
  }, [accountId, busy, router, sessionId]);

  return (
    <main className="flex min-h-[70dvh] flex-1 items-center justify-center px-5 py-16">
      <section className="w-full max-w-xl text-center" aria-labelledby="together-ready-title">
        <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-gold-700 uppercase">Fiyu Together</p>
        {session?.reveal_pending ? (
          <>
            <h1 id="together-ready-title" className="mt-5 font-display text-4xl leading-tight text-ink">
              {participantName} × {session.partner?.display_name ?? "your partner"}
            </h1>
            <p className="mt-5 font-display text-2xl text-ink">Your Fiyu Together is ready.</p>
            <p className="mt-2 text-sm text-ink-muted">{session.restaurants.length} Picks chosen for both of you.</p>
            <Button className="mt-8" disabled={busy} onClick={() => void reveal()}>Reveal our Picks</Button>
          </>
        ) : !error ? <p className="mt-6 text-sm text-ink-muted">Opening your Together…</p> : null}
        {error ? <p role="alert" className="mt-6 text-sm text-rose-dust">{error}</p> : null}
      </section>
    </main>
  );
}

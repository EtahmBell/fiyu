"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { GooglePlaceSelector } from "@/components/my-pick/GooglePlaceSelector";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { submitMyPick } from "@/lib/api/client";

type ComposerState = "search" | "confirm" | "submitting" | "submitted";

export function MyPickComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<ComposerState>("search");
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const close = () => {
    if (state !== "submitting") onClose();
  };
  const choose = (selectedPlaceId: string) => {
    setPlaceId(selectedPlaceId);
    setError(null);
    setState("confirm");
  };
  const submit = async () => {
    if (!placeId) return;
    setError(null);
    setState("submitting");
    try {
      const result = await submitMyPick(placeId);
      setSubmittedId(result.my_pick_id);
      setState("submitted");
    } catch {
      setError("My Pick could not be submitted right now. Please try again.");
      setState("confirm");
    }
  };

  return (
    <Sheet open={open} onClose={close} title="My Pick" placement="dialog" closeOnBackdrop={false} className="pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="flex items-start justify-between gap-4 px-5 pt-3 sm:px-7 sm:pt-6">
        <div><p className="text-xs font-semibold tracking-[0.15em] text-lavender-700 uppercase">My Pick</p><h2 id={titleId} className="mt-2 font-display text-2xl text-ink">Have somewhere in mind?</h2></div>
        <button type="button" onClick={close} disabled={state === "submitting"} aria-label="Close My Pick" className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-2xl leading-none text-ink-muted hover:bg-subtle hover:text-ink disabled:opacity-40">×</button>
      </div>
      <div aria-labelledby={titleId} aria-describedby={descriptionId} className="min-w-0 px-5 pt-2 sm:px-7">
        {state === "search" ? <><p id={descriptionId} className="text-sm leading-6 text-ink-muted">Give Fiyu a restaurant and we&apos;ll look into it.</p><div className="relative isolate mt-5 min-w-0 max-w-full overflow-visible"><GooglePlaceSelector onSelect={choose} /></div></> : null}
        {state === "confirm" || state === "submitting" ? <div aria-live="polite"><p id={descriptionId} className="text-sm leading-6 text-ink-muted">Restaurant selected and ready to send to Fiyu.</p><div className="mt-5 rounded-xl border border-line bg-subtle px-4 py-4"><p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Selected restaurant</p><p className="mt-1 text-sm text-ink">Your Google Places selection</p></div><button type="button" className="mt-3 min-h-11 text-sm font-medium text-plum hover:text-plum-700" disabled={state === "submitting"} onClick={() => { setPlaceId(null); setError(null); setState("search"); }}>Choose another</button><Button className="mt-3 w-full" variant="primary" disabled={state === "submitting"} onClick={() => void submit()}>{state === "submitting" ? "Submitting…" : "Ask Fiyu about this place"}</Button>{error ? <p role="alert" className="mt-3 text-sm text-dusty-rose">{error}</p> : null}</div> : null}
        {state === "submitted" ? <div className="py-3 text-center" aria-live="polite"><h3 id={descriptionId} className="font-display text-2xl text-ink">Submitted to Fiyu</h3><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-ink-muted">We&apos;ll look into it and let you know when your My Pick is ready.</p><Button className="mt-6 w-full" variant="primary" onClick={close}>Done</Button>{submittedId ? <Link href={`/my-pick?id=${encodeURIComponent(submittedId)}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-plum">View My Picks</Link> : null}</div> : null}
      </div>
    </Sheet>
  );
}

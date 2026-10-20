"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { MyPickComposer } from "@/components/my-pick/MyPickComposer";
import type { MyPick } from "@/lib/api/schemas";

export function MyPickEntry({
  signedIn,
  onSubmitted,
  variant = "card",
}: {
  signedIn: boolean;
  onSubmitted?: (myPick: MyPick) => void;
  variant?: "card" | "utility";
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const submittedRef = useRef<MyPick | null>(null);
  const close = () => {
    setOpen(false);
    const submitted = submittedRef.current;
    submittedRef.current = null;
    if (submitted) onSubmitted?.(submitted);
    window.requestAnimationFrame(() => trigger.current?.focus());
  };
  const submitted = (myPick: MyPick) => { submittedRef.current = myPick; };
  const content = <><h2 id="my-pick-entry-title" className="font-display text-2xl text-ink">Try My Pick</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Give Fiyu a restaurant and we&apos;ll score it.</p><span aria-hidden="true" className="mt-4 inline-block font-semibold text-plum">Submit a restaurant →</span></>;

  if (variant === "utility") {
    return <>
      {signedIn ? <button ref={trigger} type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center text-sm font-semibold text-plum hover:text-plum-700">Submit another →</button> : null}
      {open ? <MyPickComposer open onClose={close} onSubmitted={submitted} /> : null}
    </>;
  }

  return <aside className="mt-6" aria-labelledby="my-pick-entry-title">
    {signedIn ? <button ref={trigger} type="button" onClick={() => setOpen(true)} className="block w-full rounded-card border border-lavender-100 bg-lavender-50/35 p-5 text-left hover:border-lavender-200 hover:bg-lavender-50/60">{content}</button> : <Link href="/signin?next=%2Fpicks" className="block rounded-card border border-lavender-100 bg-lavender-50/35 p-5 hover:border-lavender-200 hover:bg-lavender-50/60">{content}</Link>}
    {open ? <MyPickComposer open onClose={close} onSubmitted={submitted} /> : null}
  </aside>;
}

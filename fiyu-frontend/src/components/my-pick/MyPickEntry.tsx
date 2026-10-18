"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { MyPickComposer } from "@/components/my-pick/MyPickComposer";

export function MyPickEntry({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    window.requestAnimationFrame(() => trigger.current?.focus());
  };
  const content = <><p className="text-xs font-semibold tracking-[0.14em] text-lavender-700 uppercase">Have somewhere in mind?</p><h2 id="my-pick-entry-title" className="mt-2 font-display text-2xl text-ink">Try My Pick</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Give Fiyu a restaurant and we&apos;ll look into it.</p><span aria-hidden="true" className="mt-4 inline-block font-semibold text-plum">Open My Pick →</span></>;

  return <aside className="mt-6" aria-labelledby="my-pick-entry-title">
    {signedIn ? <button ref={trigger} type="button" onClick={() => setOpen(true)} className="block w-full rounded-card border border-lavender-100 bg-lavender-50/35 p-5 text-left hover:border-lavender-200 hover:bg-lavender-50/60">{content}</button> : <Link href="/signin?next=%2Fpicks" className="block rounded-card border border-lavender-100 bg-lavender-50/35 p-5 hover:border-lavender-200 hover:bg-lavender-50/60">{content}</Link>}
    {signedIn ? <div className="mt-2 text-right"><Link href="/my-pick" className="inline-flex min-h-11 items-center text-sm font-medium text-ink-muted hover:text-ink">View My Picks</Link></div> : null}
    {open ? <MyPickComposer open onClose={close} /> : null}
  </aside>;
}

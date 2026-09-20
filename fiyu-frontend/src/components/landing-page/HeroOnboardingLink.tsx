"use client";

import Link from "next/link";

import { useProfileIdentity } from "@/lib/profile/profileIdentity";

const CTA_CLASS = "inline-flex min-h-12 w-52 max-w-full items-center justify-center whitespace-nowrap rounded-chip bg-plum px-5 text-sm font-medium text-white transition-colors duration-200 ease-(--ease-fiyu) hover:bg-lavender-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum";

export function HeroOnboardingLink() {
  const identity = useProfileIdentity();

  // Match the server snapshot and never offer signup while session lookup is pending.
  if (identity.status === "loading") {
    return <button type="button" disabled aria-busy="true" className={CTA_CLASS}>Loading…</button>;
  }

  // A known session still counts when its profile is temporarily unavailable.
  const signedIn = identity.profile !== null || identity.email !== null;
  const unresolved = identity.status === "unavailable" && !signedIn;
  return (
    <Link href={signedIn ? "/picks" : unresolved ? "/signin?next=/picks" : "/signup?next=/picks"} className={CTA_CLASS}>
      {signedIn ? "See today’s Picks" : unresolved ? "Continue to Fiyu" : "Get your Fiyu Picks"}
    </Link>
  );
}

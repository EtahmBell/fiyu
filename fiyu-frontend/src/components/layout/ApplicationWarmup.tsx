"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useProfileIdentity } from "@/lib/profile/profileIdentity";

const PRIMARY_DESTINATIONS = ["/picks", "/lists", "/log", "/map", "/profile"] as const;

/** Prefetch only primary route payloads after the one-time account boot resolves. */
export function ApplicationWarmup() {
  const router = useRouter();
  const identity = useProfileIdentity();

  useEffect(() => {
    if (identity.status !== "ready" || !identity.profile) return;
    for (const href of PRIMARY_DESTINATIONS) router.prefetch(href);
  }, [identity.profile, identity.status, router]);

  return null;
}

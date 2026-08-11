"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { useProfileIdentity } from "@/lib/profile/profileIdentity";

export function usePicksEntryHref(): "/picks" | "/signin?next=/picks" {
  const identity = useProfileIdentity();
  return identity.status === "ready" && (identity.profile !== null || identity.email !== null)
    ? "/picks"
    : "/signin?next=/picks";
}

export function AuthAwarePicksLink(props: Omit<ComponentProps<typeof Link>, "href">) {
  return <Link href={usePicksEntryHref()} {...props} />;
}

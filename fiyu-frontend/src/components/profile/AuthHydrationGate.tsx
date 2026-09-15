"use client";

import { StatusMessage } from "@/components/ui/StatusMessage";
import { refreshProfileIdentity, useProfileIdentity } from "@/lib/profile/profileIdentity";

/** A transient session failure must not silently become a signed-out application. */
export function AuthHydrationGate({ children }: { children: React.ReactNode }) {
  const identity = useProfileIdentity();
  if (identity.status !== "unavailable") return children;
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <StatusMessage
        title="We couldn’t check your account"
        description="Check your connection and try again. Your local session has not been cleared."
        tone="error"
        action={<button type="button" onClick={() => void refreshProfileIdentity(true)} className="min-h-11 font-semibold text-plum underline underline-offset-4">Try again</button>}
      />
    </main>
  );
}

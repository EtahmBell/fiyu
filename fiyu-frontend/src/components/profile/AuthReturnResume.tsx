"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { classifyAuthFailure } from "@/lib/auth/authErrors";
import { authService } from "@/lib/auth/authService";
import { logClientEvent } from "@/lib/clientLog";
import { clearAuthReturnPath, pendingAuthReturnPath } from "@/lib/navigation/safeRedirect";

/** Resumes a safe stored destination when an email-verification callback lands without `next`. */
export function AuthReturnResume() {
  const pathname = usePathname();
  const router = useRouter();
  const [callbackError, setCallbackError] = useState<"invalid" | "transient" | null>(null);
  const processedPath = useRef<string | null>(null);
  const resume = useCallback(async () => {
    const callbackParameters = new URLSearchParams(`${window.location.search}&${window.location.hash.replace(/^#/, "")}`);
    if (callbackParameters.has("error") || callbackParameters.has("error_code")) {
      setCallbackError("invalid");
      logClientEvent("auth.callback.failed", { operation: "callback", errorCode: "invalid_callback" });
      return;
    }
    const destination = pendingAuthReturnPath();
    if (!destination || pathname === "/signin" || pathname === "/signup") return;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` === destination) {
      clearAuthReturnPath();
      return;
    }
    try {
      const session = await authService.getSession();
      if (!session) return;
      clearAuthReturnPath();
      setCallbackError(null);
      router.replace(destination);
    } catch (cause) {
      const error = classifyAuthFailure(cause);
      setCallbackError(error.isTransient ? "transient" : "invalid");
      logClientEvent("auth.callback.failed", { operation: "callback", errorCode: error.code, status: error.status });
    }
  }, [pathname, router]);

  useEffect(() => {
    if (processedPath.current === pathname) return;
    processedPath.current = pathname;
    void Promise.resolve().then(resume);
  }, [pathname, resume]);
  if (!callbackError) return null;
  return (
    <div role="alert" className="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl rounded-lg border border-line bg-surface p-4 text-sm text-ink shadow-lg">
      <p>{callbackError === "transient" ? "We couldn’t finish signing you in. Check your connection and try again." : "This sign-in link is invalid or has expired. Request a new link and try again."}</p>
      {callbackError === "transient" ? <button type="button" onClick={() => void resume()} className="mt-2 min-h-11 font-semibold text-plum underline underline-offset-4">Try again</button> : null}
    </div>
  );
}

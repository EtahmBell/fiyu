"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/Button";
import { StatusMessage } from "@/components/ui/StatusMessage";

/**
 * Last-resort boundary for unexpected render failures.
 *
 * Expected API problems (backend down, malformed catalog, 404) are handled
 * inline by the page so the shell stays visible. Anything reaching here is a
 * bug, so the message stays generic and the digest is shown for correlation
 * with server logs -- the raw error message is deliberately not rendered, since
 * it can contain internals.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error rendering the discovery page:", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 items-center px-5 pt-16 pb-[calc(var(--spacing-mobile-nav)+2rem)] sm:px-8 lg:pb-16">
      <StatusMessage
        tone="error"
        className="w-full"
        title="Something went wrong"
        description={
          <div className="space-y-2">
            <p>The page couldn&apos;t be displayed. Trying again may resolve it.</p>
            {error.digest && (
              <p className="text-xs text-ink-faint">
                Reference: <code className="font-mono">{error.digest}</code>
              </p>
            )}
          </div>
        }
        action={
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </main>
  );
}

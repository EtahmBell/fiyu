"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Report when an element first approaches the viewport.
 *
 * Used to defer photo requests: every preview costs a billed Google call on the
 * backend, so a card must not fetch until someone is plausibly about to see it.
 *
 * Latches on: once true it never goes back to false, so scrolling a card in and
 * out cannot re-trigger the request.
 */
export function useInView<T extends Element>(rootMargin = "300px"): {
  ref: React.RefObject<T | null>;
  inView: boolean;
} {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const element = ref.current;
    if (!element) return;

    // Without IntersectionObserver, load on the next frame rather than never.
    // Scheduling rather than setting synchronously keeps this out of the
    // render cascade, and matches how the observer path reports.
    if (typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}

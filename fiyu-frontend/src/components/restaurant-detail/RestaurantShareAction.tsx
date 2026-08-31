"use client";

import { useEffect, useRef, useState } from "react";

import { restaurantDetailHref } from "@/lib/navigation/restaurantDetail";

type ShareFeedback = "idle" | "copied" | "manual";

function ShareIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 fill-none stroke-current">
      <circle cx="5" cy="10" r="1.75" />
      <circle cx="14.5" cy="5" r="1.75" />
      <circle cx="14.5" cy="15" r="1.75" />
      <path d="m6.6 9.15 6.25-3.3M6.6 10.85l6.25 3.3" strokeWidth="1.4" />
    </svg>
  );
}

export function RestaurantShareAction({
  placeId,
  restaurantName,
}: {
  placeId: string;
  restaurantName: string;
}) {
  const [feedback, setFeedback] = useState<ShareFeedback>("idle");
  const feedbackTimer = useRef<number | null>(null);
  const path = restaurantDetailHref(placeId);
  const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();

  useEffect(() => () => {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
  }, []);

  const showCopied = () => {
    setFeedback("copied");
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => {
      setFeedback("idle");
      feedbackTimer.current = null;
    }, 2_500);
  };

  const share = async () => {
    const data: ShareData = {
      title: `${restaurantName} on Fiyu`,
      text: "Thought you might like this place on Fiyu.",
      url,
    };

    if (typeof navigator.share === "function") {
      try {
        await navigator.share(data);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setFeedback("manual");
      }
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      showCopied();
    } catch {
      setFeedback("manual");
    }
  };

  return (
    <div className="contents">
      <button
        type="button"
        onClick={() => void share()}
        aria-label={`Share ${restaurantName}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-ink-muted transition-colors hover:bg-lavender-50/70 hover:text-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
      >
        <ShareIcon />
        <span>Share</span>
      </button>
      {feedback === "copied" && (
        <span role="status" className="text-xs font-medium text-lavender-700">Link copied</span>
      )}
      {feedback === "manual" && (
        <label className="basis-full text-xs text-ink-muted">
          <span className="mb-1 block">Copy this link</span>
          <input
            aria-label="Restaurant link to copy"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            className="min-h-10 w-full rounded-md border border-line bg-surface px-3 text-xs text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lavender-600"
          />
        </label>
      )}
    </div>
  );
}

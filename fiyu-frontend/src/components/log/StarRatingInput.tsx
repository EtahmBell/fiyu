"use client";

import { useRef, useState } from "react";

import type { VisitRating } from "@/lib/api/schemas";
import { cn } from "@/lib/utils/cn";

const RATINGS: VisitRating[] = [1, 2, 3, 4, 5];

export function StarRatingInput({
  value,
  onChange,
  describedBy,
}: {
  value: VisitRating | null;
  onChange: (rating: VisitRating) => void;
  describedBy?: string;
}) {
  const [preview, setPreview] = useState<VisitRating | null>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const visibleRating = preview ?? value ?? 0;

  const selectAndFocus = (rating: VisitRating) => {
    onChange(rating);
    buttons.current[rating - 1]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="How was it?"
      aria-required="true"
      aria-describedby={describedBy}
      className="mt-2 flex w-fit items-center gap-1"
      onPointerLeave={() => setPreview(null)}
    >
      {RATINGS.map((rating) => {
        const active = rating <= visibleRating;
        const selected = rating === value;
        return (
          <button
            key={rating}
            ref={(node) => { buttons.current[rating - 1] = node; }}
            type="button"
            role="radio"
            aria-label={`${rating} out of 5 stars`}
            aria-checked={selected}
            tabIndex={selected || (value === null && rating === 1) ? 0 : -1}
            onPointerEnter={() => setPreview(rating)}
            onFocus={() => setPreview(rating)}
            onBlur={() => setPreview(null)}
            onClick={() => onChange(rating)}
            onKeyDown={(event) => {
              const current = value ?? rating;
              let next: VisitRating | null = null;
              if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                next = Math.min(5, current + 1) as VisitRating;
              } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                next = Math.max(1, current - 1) as VisitRating;
              } else if (event.key === "Home") {
                next = 1;
              } else if (event.key === "End") {
                next = 5;
              }
              if (next !== null) {
                event.preventDefault();
                selectAndFocus(next);
              }
            }}
            className={cn(
              "inline-flex size-11 items-center justify-center rounded-full text-[1.65rem] leading-none transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600",
              active ? "text-lavender-600" : "text-ink-faint hover:text-lavender-300",
            )}
          >
            <span aria-hidden="true">{active ? "★" : "☆"}</span>
          </button>
        );
      })}
    </div>
  );
}

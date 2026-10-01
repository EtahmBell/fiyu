"use client";

import {
  PERSONAL_MAP_FILTERS,
  type PersonalMapFilter,
} from "@/lib/map/personalMap";
import { cn } from "@/lib/utils/cn";

const LABELS: Record<PersonalMapFilter, string> = {
  all: "All",
  saved: "Saved",
  visited: "Visited",
  discovered: "Discovered",
};

interface PersonalMapFilterControlProps {
  value: PersonalMapFilter;
  onChange: (filter: PersonalMapFilter) => void;
  showHeading?: boolean;
  className?: string;
}

export function PersonalMapFilterControl({
  value,
  onChange,
  showHeading = false,
  className,
}: PersonalMapFilterControlProps) {
  return (
    <div
      data-testid="personal-map-filter-control"
      className={cn(
        "rounded-card border border-line bg-surface/95 px-3 py-2.5 shadow-lg backdrop-blur-sm",
        className,
      )}
    >
      {showHeading && (
        <h1 className="font-display text-xl leading-none text-ink">Your map</h1>
      )}
      <div
        role="tablist"
        aria-label="Map places"
        /*
         * Content-sized segments rather than four equal columns. With equal
         * columns the spare width went to the short labels: All floated in a
         * wide cell while Discovered, three times its length, filled (and at
         * 320px overran) its quarter and sat against the edge. As flex-auto
         * items every segment is its label plus an equal share of what is
         * left, so the space around each label -- including at the outer
         * edges -- is the same.
         */
        className={cn(
          "flex min-w-0 rounded-chip border border-line/80 bg-subtle/80 p-0.5",
          showHeading && "mt-2.5",
        )}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          const tabs = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
          const current = tabs.indexOf(document.activeElement as HTMLElement);
          if (current < 0) return;
          event.preventDefault();
          const next = event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          tabs[next]?.focus();
        }}
      >
        {PERSONAL_MAP_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={value === filter}
            tabIndex={value === filter ? 0 : -1}
            onClick={() => onChange(filter)}
            className={cn(
              "min-h-11 flex-auto rounded-chip px-1.5 text-[0.625rem] whitespace-nowrap font-semibold tracking-[0.025em] transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lavender-500 min-[410px]:text-[0.6875rem]",
              value === filter
                ? "bg-surface text-lavender-700 shadow-sm"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {LABELS[filter]}
          </button>
        ))}
      </div>
    </div>
  );
}

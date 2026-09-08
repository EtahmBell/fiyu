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
      className={cn(
        "rounded-card border border-line bg-surface/95 px-3.5 py-3 shadow-lg backdrop-blur-sm",
        className,
      )}
    >
      {showHeading && (
        <>
          <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-lavender-700 uppercase">
            Tokyo edition
          </p>
          <h1 className="mt-1 font-display text-2xl leading-none text-ink">Your map</h1>
        </>
      )}
      <div
        role="tablist"
        aria-label="Map places"
        className={cn(
          "grid grid-cols-4 rounded-chip border border-line/80 bg-subtle/80 p-0.5",
          showHeading && "mt-3",
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
              "min-h-10 rounded-chip px-1 text-[0.625rem] font-semibold tracking-[0.025em] transition-colors",
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

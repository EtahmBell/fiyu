"use client";

import { RestaurantCard } from "@/components/restaurant/RestaurantCard";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { cn } from "@/lib/utils/cn";

export interface MapPeekSheetProps {
  restaurant: PublicRestaurant;
  expanded: boolean;
  onToggleExpanded: () => void;
  onDismiss: () => void;
}

/**
 * Bottom sheet shown when a map pin is selected on mobile.
 *
 * Deliberately NOT a <dialog>: this is a peek, not a modal. The map must stay
 * pannable and the other pins tappable while it is open, which a modal would
 * prevent by making the background inert.
 *
 * Two heights rather than free dragging: collapsed shows the recommendation,
 * expanded shows tags and dishes. A discrete toggle is reliable across touch
 * and keyboard, whereas drag-to-resize is neither without significant work.
 */
export function MapPeekSheet({
  restaurant,
  expanded,
  onToggleExpanded,
  onDismiss,
}: MapPeekSheetProps) {
  return (
    <div
      role="region"
      aria-label="Selected restaurant"
      className={cn(
        "pointer-events-auto overflow-hidden rounded-t-2xl bg-surface",
        "shadow-[0_-2px_24px_-8px_rgba(49,40,61,0.28)]",
        "transition-[max-height] duration-200 ease-(--ease-fiyu)",
        expanded ? "max-h-[70dvh]" : "max-h-64",
      )}
      style={{ animation: "fiyu-sheet-in 220ms var(--ease-fiyu)" }}
    >
      <div className="flex items-center justify-between border-b border-line px-2 py-1">
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg text-xs text-ink-muted"
        >
          <span aria-hidden="true" className="h-1 w-9 rounded-full bg-line-strong" />
          <span className="sr-only">{expanded ? "Collapse details" : "Expand details"}</span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 min-w-11 rounded-lg text-sm text-ink-muted transition-colors duration-200 ease-(--ease-fiyu) hover:text-ink"
        >
          <span aria-hidden="true">×</span>
          <span className="sr-only">Dismiss</span>
        </button>
      </div>

      <div className={cn("overflow-y-auto", expanded ? "max-h-[calc(70dvh-2.75rem)]" : "")}>
        <RestaurantCard restaurant={restaurant} selected dense />
      </div>
    </div>
  );
}

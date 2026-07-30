"use client";

import { RestaurantCard } from "@/components/restaurant/RestaurantCard";
import { Button } from "@/components/ui/Button";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { hasGoldFiyuTreatment } from "@/lib/format/score";
import { cn } from "@/lib/utils/cn";

export interface ConcealedRestaurantCardProps {
  restaurant: PublicRestaurant;
  position: number;
  revealed: boolean;
  saved: boolean;
  onReveal(): void;
  onToggleSaved(): void;
}

/** Conceals all identifying content until the user deliberately reveals it. */
export function ConcealedRestaurantCard({
  restaurant,
  position,
  revealed,
  saved,
  onReveal,
  onToggleSaved,
}: ConcealedRestaurantCardProps) {
  const gold = hasGoldFiyuTreatment(restaurant.fiyu_score);

  if (!revealed) {
    return (
      <article
        data-testid="concealed-restaurant-card"
        data-gold-treatment={gold ? "true" : "false"}
        className={cn(
          "relative flex min-h-44 items-center justify-center overflow-hidden rounded-card border bg-surface px-6 py-8 text-center",
          gold
            ? "border-gold shadow-[0_0_18px_-10px_var(--color-gold)]"
            : "border-line-strong",
        )}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 22%, var(--color-lavender-100), transparent 42%), radial-gradient(circle at 82% 78%, var(--color-gold-soft), transparent 38%)",
          }}
        />
        <button
          type="button"
          onClick={onReveal}
          aria-label={`Tap to reveal restaurant ${position}`}
          className="relative z-10 flex min-h-24 w-full flex-col items-center justify-center rounded-lg focus-visible:outline-none"
        >
          <span className="font-display text-2xl text-plum">Fiyu</span>
          <span className="mt-2 text-xs font-medium tracking-[0.12em] text-lavender-700 uppercase">
            Tap to reveal
          </span>
        </button>
      </article>
    );
  }

  return (
    <div
      data-testid="revealed-restaurant-card"
      data-gold-treatment={gold ? "true" : "false"}
      className={cn(
        "overflow-hidden rounded-card border bg-surface",
        gold ? "border-gold" : "border-line",
      )}
      style={{ animation: "fiyu-fade-in 260ms var(--ease-fiyu)" }}
    >
      <RestaurantCard restaurant={restaurant} />
      <div className="flex justify-end border-t border-line px-4 py-3 sm:px-5">
        <Button
          variant={saved ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={saved}
          onClick={onToggleSaved}
        >
          {saved ? "Saved" : "Save restaurant"}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { CompactRestaurantCard } from "@/components/daily-picks/CompactRestaurantCard";
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
  onOpen?: (restaurant: PublicRestaurant) => void;
}

/** Conceals all identifying content until the user deliberately reveals it. */
export function ConcealedRestaurantCard({
  restaurant,
  position,
  revealed,
  saved,
  onReveal,
  onToggleSaved,
  onOpen,
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
    >
      <CompactRestaurantCard
        restaurant={restaurant}
        saved={saved}
        onOpen={onOpen}
        onToggleSaved={onToggleSaved}
      />
    </div>
  );
}

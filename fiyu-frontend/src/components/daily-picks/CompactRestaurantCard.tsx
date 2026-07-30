"use client";

import type { KeyboardEvent, MouseEvent } from "react";

import { OutboundMapActions } from "@/components/restaurant/OutboundMapActions";
import { RestaurantPhoto } from "@/components/restaurant/RestaurantPhoto";
import { TagList } from "@/components/restaurant/TagList";
import { Button } from "@/components/ui/Button";
import { ScoreMark } from "@/components/ui/ScoreMark";
import type { PublicRestaurant } from "@/lib/api/schemas";
import {
  compactDescription,
  englishCardTags,
  englishStructuredValue,
} from "@/lib/daily-picks/cardContent";
import { cn } from "@/lib/utils/cn";

export interface CompactRestaurantCardProps {
  restaurant: PublicRestaurant;
  saved: boolean;
  expirationLabel?: string;
  onOpen?: (restaurant: PublicRestaurant) => void;
  onToggleSaved(): void;
}

function actionTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("a, button"));
}

export function CompactRestaurantCard({
  restaurant,
  saved,
  expirationLabel,
  onOpen,
  onToggleSaved,
}: CompactRestaurantCardProps) {
  const englishName = englishStructuredValue(restaurant.name_en);
  const title = restaurant.name_ja?.trim() || englishName || "Unnamed restaurant";
  const subtitle = englishName && englishName !== title ? englishName : null;
  const description = compactDescription(restaurant);
  const tags = englishCardTags(restaurant);

  const open = () => onOpen?.(restaurant);
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (!actionTarget(event.target)) open();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    open();
  };

  return (
    <article
      data-testid="compact-restaurant-card"
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `View ${title}` : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative overflow-hidden rounded-card border border-line bg-surface p-2.5 shadow-[0_6px_20px_-18px_rgba(49,40,61,0.35)]",
        onOpen && "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600",
      )}
      style={{ animation: "fiyu-fade-in 260ms var(--ease-fiyu)" }}
    >
      <div
        data-testid="compact-card-layout"
        className="grid min-w-0 grid-cols-1 items-stretch gap-3 min-[420px]:grid-cols-[minmax(10rem,36%)_minmax(0,1fr)]"
      >
        <RestaurantPhoto
          placeId={restaurant.place_id}
          restaurantName={title}
          fill
          className="h-44 min-w-0 min-[420px]:h-full min-[420px]:min-h-52"
        />

        <div className="min-w-0 pr-24">
          <h3
            lang={restaurant.name_ja?.trim() ? "ja" : "en"}
            className="truncate font-display text-xl leading-tight text-ink"
          >
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 truncate text-sm text-ink-muted">{subtitle}</p>}

          {description && (
            <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-ink/80">{description}</p>
          )}

          {expirationLabel && (
            <p className="mt-2 text-[0.6875rem] text-ink-faint">{expirationLabel}</p>
          )}
        </div>

        <ScoreMark score={restaurant.fiyu_score} size="lg" className="absolute top-3 right-3" />
      </div>

      {tags.length > 0 && <TagList tags={tags} max={3} className="mt-2" />}

      <div className="relative z-10 mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
        <div onClick={(event) => event.stopPropagation()}>
          <OutboundMapActions restaurant={restaurant} />
        </div>
        <Button
          variant={saved ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={saved}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSaved();
          }}
          className="min-h-9 px-3 text-xs"
        >
          {saved ? "Saved" : "Save"}
        </Button>
      </div>
    </article>
  );
}

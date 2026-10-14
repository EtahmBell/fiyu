"use client";

import { useEffect, useRef } from "react";
import { CompactRestaurantCard } from "@/components/daily-picks/CompactRestaurantCard";
import { PickCardBack } from "@/components/pick-reveal/PickCardBack";
import revealStyles from "@/components/pick-reveal/PickReveal.module.css";
import {
  PICK_REVEAL_CROSSFADE_MS,
  usePickRevealTransition,
} from "@/components/pick-reveal/usePickRevealTransition";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { hasGoldFiyuTreatment } from "@/lib/format/score";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { cn } from "@/lib/utils/cn";

export interface ConcealedRestaurantCardProps {
  restaurant: PublicRestaurant;
  position: number;
  revealed: boolean;
  saved: boolean;
  savePending?: boolean;
  revealPending?: boolean;
  onReveal(): void;
  onToggleSaved(): void;
  onOpen?: (restaurant: PublicRestaurant) => void;
  onViewDetails?: (restaurant: PublicRestaurant) => void;
}

export const PICK_REVEAL_MS = PICK_REVEAL_CROSSFADE_MS;

/** Persistent reveal truth comes from the parent; motion exists only on this mount. */
export function ConcealedRestaurantCard({
  restaurant, position, revealed, saved, savePending = false, revealPending = false,
  onReveal, onToggleSaved, onOpen, onViewDetails,
}: ConcealedRestaurantCardProps) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const frontRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const transition = usePickRevealTransition({
    ready: revealed,
    pending: revealPending,
    reducedMotion,
    debugLabel: `Daily ${position}`,
  });
  const gold = revealed && hasGoldFiyuTreatment(restaurant.fiyu_score);

  useEffect(() => {
    if (transition.phase === "revealed" && restoreFocus.current) {
      restoreFocus.current = false;
      const front = frontRef.current;
      const target = front?.querySelector<HTMLElement>('button[aria-label="View restaurant"]')
        ?? front?.querySelector<HTMLElement>("button, a, [tabindex='0']");
      target?.focus({ preventScroll: true });
    }
  }, [transition.phase]);

  return (
    <div
      className={cn(
        revealStyles.stage,
        revealStyles.cardFrame,
        revealStyles.motionTarget,
        "rounded-card",
      )}
      data-testid={revealed ? "revealed-restaurant-card" : "concealed-restaurant-card"}
      data-pick-card-size="daily-reveal"
      data-gold-treatment={gold ? "true" : "false"}
      data-reveal-motion={transition.phase}
      data-reveal-phase={transition.phase}
      data-reveal-active={transition.active ? "true" : "false"}
      data-reveal-variant="regular"
      onClickCapture={(event) => {
        if (transition.active) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <div
        className={cn(revealStyles.hiddenFace, revealStyles.hiddenSurface)}
        data-reveal-variant="regular"
        data-testid="pick-hidden-face"
        aria-hidden={transition.visuallyRevealed}
        inert={transition.visuallyRevealed}
      >
        <button
          type="button"
          disabled={revealPending || transition.active}
          aria-busy={revealPending}
          aria-label={`Reveal Fiyu Pick ${position}`}
          onClick={(event) => {
            if (!transition.begin()) return;
            restoreFocus.current = event.detail === 0;
            onReveal();
          }}
          className={cn(
            revealStyles.backButton,
            "size-full select-none rounded-card text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600 disabled:cursor-wait",
          )}
        >
          <PickCardBack />
        </button>
      </div>
      {revealed ? (
        <div
          ref={frontRef}
          className={cn(revealStyles.restaurantFace, "flex flex-col")}
          data-testid="pick-restaurant-face"
          aria-hidden={transition.phase !== "revealed"}
          inert={transition.phase !== "revealed"}
        >
          <CompactRestaurantCard
            restaurant={restaurant}
            layout="reveal"
            saved={saved}
            savePending={savePending}
            onOpen={onOpen}
            onViewDetails={onViewDetails}
            onToggleSaved={onToggleSaved}
          />
        </div>
      ) : null}
      <span
        aria-hidden="true"
        className={revealStyles.shineOverlay}
        data-reveal-active={transition.active ? "true" : "false"}
        data-testid={transition.active ? "pick-shine" : undefined}
      />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { CompactRestaurantCard } from "@/components/daily-picks/CompactRestaurantCard";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { hasGoldFiyuTreatment } from "@/lib/format/score";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import styles from "./PickReveal.module.css";

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

export const PICK_FLIP_MS = 500;

/** Persistent reveal truth comes from the parent; motion exists only on this mount. */
export function ConcealedRestaurantCard({
  restaurant, position, revealed, saved, savePending = false, revealPending = false,
  onReveal, onToggleSaved, onOpen, onViewDetails,
}: ConcealedRestaurantCardProps) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [previousRevealed, setPreviousRevealed] = useState(revealed);
  const [animating, setAnimating] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  // Derive the transition before paint, avoiding a one-frame front flash.
  if (revealed !== previousRevealed) {
    setPreviousRevealed(revealed);
    setAnimating(revealed && !reducedMotion);
  }
  const moving = animating && !reducedMotion;
  const gold = revealed && hasGoldFiyuTreatment(restaurant.fiyu_score);

  useEffect(() => {
    if (!animating) return;
    const timer = window.setTimeout(() => setAnimating(false), reducedMotion ? 0 : PICK_FLIP_MS);
    return () => window.clearTimeout(timer);
  }, [animating, reducedMotion]);

  useEffect(() => {
    if (revealed && !moving && restoreFocus.current) {
      restoreFocus.current = false;
      const front = frontRef.current;
      const target = front?.querySelector<HTMLElement>('button[aria-label="View restaurant"]')
        ?? front?.querySelector<HTMLElement>("button, a, [tabindex='0']");
      target?.focus({ preventScroll: true });
    }
  }, [revealed, moving]);

  return (
    <div className={styles.scene}
      data-testid={revealed ? "revealed-restaurant-card" : "concealed-restaurant-card"}
      data-gold-treatment={gold ? "true" : "false"}
      data-reveal-motion={moving ? "flipping" : "resting"}
      onClickCapture={(event) => { if (moving) { event.preventDefault(); event.stopPropagation(); } }}
    >
      <div className={styles.rotor} data-front={revealed} data-moving={moving}>
        {(!revealed || moving) && <div className={styles.back} aria-hidden={revealed} inert={revealed}>
          <button type="button" disabled={revealPending} aria-busy={revealPending}
            aria-label={`Reveal Fiyu Pick ${position}`}
            onClick={(event) => {
              if (revealPending) return;
              restoreFocus.current = event.detail === 0;
              onReveal();
            }}
            className="flex size-full select-none flex-col items-center justify-center rounded-card text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600 disabled:cursor-wait"
          >
            <span className="text-[0.625rem] tracking-[0.2em] text-lavender-700 uppercase">Fiyu Pick</span>
            <span className="mt-3 font-display text-3xl text-plum">Fiyu</span>
            <span className="mt-3 text-xs font-medium text-lavender-700">{revealPending ? "Revealing…" : "Tap to reveal"}</span>
          </button>
        </div>}
        <div ref={frontRef} className={styles.front} aria-hidden={!revealed || moving} inert={!revealed || moving}>
          {revealed && <CompactRestaurantCard
            restaurant={restaurant} saved={saved} savePending={savePending}
            onOpen={onOpen} onViewDetails={onViewDetails} onToggleSaved={onToggleSaved}
          />}
        </div>
      </div>
      {moving && <span aria-hidden="true" className={styles.sheen} />}
    </div>
  );
}

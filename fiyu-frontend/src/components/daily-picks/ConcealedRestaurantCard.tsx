"use client";

import { useEffect, useRef, useState } from "react";

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
  onViewDetails?: (restaurant: PublicRestaurant) => void;
}

/**
 * The concealed face is deliberately bare: a pale field, the card's own border,
 * and two centred lines of type. Anything patterned here competes with the
 * revealed card for attention and starts to read as packaging.
 *
 * A fixed height rather than a minimum: the fading copy of this face is
 * absolutely positioned over the revealed card, and the two must match exactly
 * or the cross-fade jumps on its first frame.
 */
const FACE_SURFACE =
  "relative flex h-44 items-center justify-center overflow-hidden rounded-card border bg-lavender-50 px-6 py-8 text-center";

/**
 * One source of truth for the fade, used both to drive the animation and to
 * drop the spent layer. A timer rather than `animationend`: the layer is inert
 * once it reaches zero, so exact frame accuracy buys nothing, and reduced-motion
 * users collapse the animation to 0.01ms without an event either way.
 */
const CONCEAL_FADE_MS = 160;

function faceEdge(gold: boolean): string {
  return gold ? "border-gold shadow-[0_0_18px_-10px_var(--color-gold)]" : "border-line-strong";
}

function RevealPrompt() {
  return (
    <>
      <span className="font-display text-2xl text-plum">Fiyu</span>
      <span className="mt-2 text-xs font-medium tracking-[0.12em] text-lavender-700 uppercase">
        Tap to reveal
      </span>
    </>
  );
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
  onViewDetails,
}: ConcealedRestaurantCardProps) {
  const gold = hasGoldFiyuTreatment(restaurant.fiyu_score);
  // Only a reveal that happens in front of the user animates. A card restored
  // from storage as already revealed renders straight into its final state.
  const wasConcealed = useRef(!revealed);
  const [fadingOut, setFadingOut] = useState(false);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    if (!revealed || !wasConcealed.current) return;
    wasConcealed.current = false;
    setFadingOut(true);
    setEntering(true);
  }, [revealed]);

  useEffect(() => {
    if (!fadingOut) return;
    const timer = window.setTimeout(() => setFadingOut(false), CONCEAL_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [fadingOut]);

  if (!revealed) {
    return (
      <article
        data-testid="concealed-restaurant-card"
        data-gold-treatment={gold ? "true" : "false"}
        className={cn(FACE_SURFACE, faceEdge(gold))}
      >
        <button
          type="button"
          onClick={onReveal}
          aria-label={`Tap to reveal restaurant ${position}`}
          className="relative z-10 flex min-h-24 w-full flex-col items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
        >
          <RevealPrompt />
        </button>
      </article>
    );
  }

  return (
    <div
      data-testid="revealed-restaurant-card"
      data-gold-treatment={gold ? "true" : "false"}
      className="relative"
    >
      {/*
       * The restaurant card mounts immediately, so its photo request starts at
       * the moment of the tap rather than after the transition. The concealed
       * face simply fades off the top of it.
       */}
      <div
        style={
          entering ? { animation: "fiyu-reveal-in 260ms var(--ease-fiyu) 40ms both" } : undefined
        }
      >
        <CompactRestaurantCard
          restaurant={restaurant}
          saved={saved}
          onOpen={onOpen}
          onViewDetails={onViewDetails}
          onToggleSaved={onToggleSaved}
        />
      </div>

      {fadingOut && (
        <div
          aria-hidden="true"
          data-testid="conceal-fade-out"
          className="pointer-events-none absolute inset-x-0 top-0 z-20"
          style={{ animation: `fiyu-fade-out ${CONCEAL_FADE_MS}ms var(--ease-fiyu) forwards` }}
        >
          <div className={cn(FACE_SURFACE, faceEdge(gold))}>
            <div className="relative z-10 flex min-h-24 w-full flex-col items-center justify-center">
              <RevealPrompt />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

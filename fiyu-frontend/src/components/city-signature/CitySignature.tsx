"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import type { CityId } from "@/lib/city/editions";
import { citySignatureFor, type CityEmptyStateKind } from "@/lib/city/signatures";
import { cn } from "@/lib/utils/cn";

export function CityHeaderMark({ cityId, className }: { cityId: CityId; className?: string }) {
  const Mark = citySignatureFor(cityId)?.headerMark;
  if (!Mark) return null;
  return (
    <Mark
      data-city-signature-mark={cityId}
      aria-hidden="true"
      className={cn("size-[1.0625rem] shrink-0 text-lavender-700", className)}
    />
  );
}

export function CityLoadingSequence({ cityId, className }: { cityId: CityId; className?: string }) {
  const illustrations = citySignatureFor(cityId)?.loadingIllustrations ?? [];
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (reducedMotion?.matches || illustrations.length < 2) return;
    const timer = window.setInterval(
      () => setActiveIndex((current) => (current + 1) % illustrations.length),
      800,
    );
    return () => window.clearInterval(timer);
  }, [illustrations.length]);

  if (illustrations.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="city-loading-sequence"
      data-active-illustration={activeIndex}
      className={cn("relative h-24 w-30", className)}
    >
      {illustrations.map((Illustration, index) => (
        <Illustration
          key={index}
          data-loading-illustration={index}
          className={cn(
            "absolute inset-0 size-full transition-opacity duration-500 ease-(--ease-fiyu)",
            index === activeIndex ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
    </div>
  );
}

export function CityPicksWatermark({ cityId, className }: { cityId: CityId; className?: string }) {
  const Watermark = citySignatureFor(cityId)?.picksWatermark;
  if (!Watermark) return null;
  return (
    <Watermark
      aria-hidden="true"
      data-city-picks-watermark={cityId}
      className={cn("pointer-events-none", className)}
    />
  );
}

export function CityEmptyState({
  cityId,
  kind,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  cityId: CityId;
  kind: CityEmptyStateKind;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const Illustration = citySignatureFor(cityId)?.emptyStateIllustrations?.[kind];

  return (
    <div
      data-city-empty-state={kind}
      className={cn(
        "rounded-card border border-line bg-lavender-50/25 text-center",
        compact ? "mt-3 px-4 py-4" : "px-5 py-6 sm:px-7",
        className,
      )}
    >
      {Illustration && (
        <Illustration
          aria-hidden="true"
          className={cn("mx-auto text-plum", compact ? "h-18 w-24" : "h-24 w-32")}
        />
      )}
      <p className={cn("font-display text-ink", compact ? "mt-1 text-lg" : "mt-2 text-xl")}>
        {title}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-ink-muted">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

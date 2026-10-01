import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type DailyCardRefRegistrar = (placeId: string, node: HTMLDivElement | null) => void;

export function DailyCardFrame({
  placeId,
  selected,
  tone = "current",
  registerRef,
  children,
}: {
  placeId: string;
  selected: boolean;
  tone?: "current" | "history";
  registerRef?: DailyCardRefRegistrar;
  children: ReactNode;
}) {
  return (
    <div
      ref={(node) => registerRef?.(placeId, node)}
      tabIndex={-1}
      data-daily-card-place-id={placeId}
      data-selected={selected ? "true" : "false"}
      className={cn(
        "min-w-0 w-full rounded-card transition-[box-shadow] duration-300 focus:outline-none",
        /*
         * Selection (the card that matches the map) is drawn flush: a 1px ring
         * directly outside the card, with the card's own border taking the
         * same colour. Ring, border and the card's inset top accent then read
         * as one continuous edge. The old 3px ring sat outside a pale border,
         * so the top showed two parallel lavender lines.
         */
        selected &&
          (tone === "history"
            ? "shadow-[0_0_0_1px_var(--color-gold)] [&_article]:border-gold!"
            : "shadow-[0_0_0_1px_var(--color-lavender-500)] [&_article]:border-lavender-500!"),
      )}
    >
      {children}
    </div>
  );
}

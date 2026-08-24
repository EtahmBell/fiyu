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
        selected &&
          (tone === "history"
            ? "shadow-[0_0_0_3px_var(--color-gold)]"
            : "shadow-[0_0_0_3px_var(--color-lavender-500)]"),
      )}
    >
      {children}
    </div>
  );
}

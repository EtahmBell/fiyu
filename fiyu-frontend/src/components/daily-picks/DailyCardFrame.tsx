import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type DailyCardRefRegistrar = (placeId: string, node: HTMLDivElement | null) => void;

export function DailyCardFrame({
  placeId,
  selected,
  registerRef,
  children,
}: {
  placeId: string;
  selected: boolean;
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
        "rounded-card transition-[box-shadow] duration-300 focus:outline-none",
        selected && "shadow-[0_0_0_3px_var(--color-lavender-500)]",
      )}
    >
      {children}
    </div>
  );
}

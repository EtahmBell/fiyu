import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

/**
 * Fills use lavender-600, never lavender-500: white on 500 measures 3.77:1 and
 * fails AA, while 600 reaches 4.89:1. The pressed state darkens to 700 rather
 * than shifting opacity, so the label keeps its contrast while held.
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-lavender-600 text-white hover:bg-lavender-700 active:bg-lavender-700",
  secondary:
    "border border-line bg-surface text-ink hover:border-line-strong hover:bg-subtle active:bg-lavender-50",
  ghost: "text-ink-muted hover:bg-subtle hover:text-ink active:bg-lavender-50",
};

/** Both sizes clear the 44px touch minimum via min-h. */
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3.5 text-sm",
  md: "min-h-11 px-5 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  children,
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium",
        "transition-[background-color,border-color,transform] duration-[180ms]",
        "ease-(--ease-fiyu) active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-40",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

"use client";

import type { ReactNode } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils/cn";

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Visible label above the track. */
  label: string;
  /**
   * Human phrasing of the current position, e.g. "Mostly hidden gems".
   * Screen readers announce this instead of the raw number, which is
   * meaningless on a discovery axis.
   */
  valueText: string;
  /** Anchor label under the left end of the track. */
  startLabel: string;
  /** Anchor label under the right end of the track. */
  endLabel: string;
  /** Rendered beside the label; used for the popularity-data disclosure. */
  note?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * Accessible range control built on a native input, so keyboard interaction,
 * touch targets and screen-reader semantics come from the platform rather than
 * from re-implemented pointer maths.
 *
 * The track is drawn as two plain divs behind a transparent input. Painting the
 * fill with a runtime <style> block would need CSS.escape on the useId value
 * (React ids contain characters that are invalid in selectors) and CSS.escape
 * does not exist during server rendering.
 */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  valueText,
  startLabel,
  endLabel,
  note,
  disabled = false,
  className,
}: SliderProps) {
  const id = useId();
  const clamped = Math.min(max, Math.max(min, value));
  const percent = max === min ? 0 : ((clamped - min) / (max - min)) * 100;

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {note}
      </div>

      <div className={cn("relative h-6", disabled && "opacity-40")}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line-strong"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-lavender-600"
          style={{ width: `${percent}%` }}
        />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={clamped}
          disabled={disabled}
          aria-valuetext={valueText}
          onChange={(event) => onChange(Number(event.target.value))}
          className={cn(
            "absolute inset-0 w-full cursor-pointer appearance-none bg-transparent",
            "disabled:cursor-not-allowed",
            "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent",
            "[&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-transparent",
            "[&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2",
            "[&::-webkit-slider-thumb]:border-lavender-600 [&::-webkit-slider-thumb]:bg-surface",
            "[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110",
            "[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full",
            "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-lavender-600 [&::-moz-range-thumb]:bg-surface",
          )}
        />
      </div>

      <div className="mt-1 flex justify-between text-xs text-ink-faint">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}

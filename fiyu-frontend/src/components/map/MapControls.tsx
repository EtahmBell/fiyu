"use client";

import { cn } from "@/lib/utils/cn";

export interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFitResults: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  /** False when nothing is mapped, so Fit has nothing to frame. */
  canFit: boolean;
}

/**
 * Map controls.
 *
 * Real buttons rather than SVG shapes, so they are reachable by keyboard,
 * announced by screen readers and sized as proper touch targets without
 * fighting the map's pan handlers. They sit outside the SVG's pointer surface
 * so pressing one never starts a drag.
 */
const BUTTON = cn(
  "flex size-11 items-center justify-center bg-surface text-ink",
  "transition-colors duration-200 ease-(--ease-fiyu)",
  "hover:bg-lavender-50 hover:text-lavender-700",
  "active:bg-lavender-100",
  "disabled:pointer-events-none disabled:text-ink-faint disabled:opacity-50",
);

export function MapControls({
  onZoomIn,
  onZoomOut,
  onReset,
  onFitResults,
  canZoomIn,
  canZoomOut,
  canFit,
}: MapControlsProps) {
  return (
    <div className="pointer-events-auto absolute top-4 right-4 flex flex-col gap-2">
      <div className="overflow-hidden rounded-xl border border-line shadow-[0_1px_3px_rgba(25,23,29,0.10)]">
        <button type="button" onClick={onZoomIn} disabled={!canZoomIn} className={BUTTON}>
          <span aria-hidden="true" className="text-lg leading-none">
            +
          </span>
          <span className="sr-only">Zoom in</span>
        </button>
        <div aria-hidden="true" className="h-px bg-line" />
        <button type="button" onClick={onZoomOut} disabled={!canZoomOut} className={BUTTON}>
          <span aria-hidden="true" className="text-lg leading-none">
            −
          </span>
          <span className="sr-only">Zoom out</span>
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-line shadow-[0_1px_3px_rgba(25,23,29,0.10)]">
        <button
          type="button"
          onClick={onFitResults}
          disabled={!canFit}
          className={BUTTON}
          title="Fit results"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none">
            <path
              d="M1.5 5.5v-4h4M14.5 5.5v-4h-4M1.5 10.5v4h4M14.5 10.5v4h-4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="sr-only">Fit results in view</span>
        </button>
        <div aria-hidden="true" className="h-px bg-line" />
        <button type="button" onClick={onReset} className={BUTTON} title="Reset view">
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none">
            <path
              d="M13.5 8a5.5 5.5 0 1 1-1.7-3.97M13.5 1.5V5H10"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="sr-only">Reset to the whole map</span>
        </button>
      </div>
    </div>
  );
}

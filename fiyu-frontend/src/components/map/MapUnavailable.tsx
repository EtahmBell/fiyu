import { cn } from "@/lib/utils/cn";

export type MapUnavailableReason =
  /** No restaurant in the current results is map-eligible. */
  | "no-mapped-restaurants"
  /** Results exist but none carry verified coordinates yet. */
  | "coordinates-pending"
  /** The SVG discovery map has not been built yet (Phase B). */
  | "not-yet-available";

export interface MapUnavailableProps {
  reason: MapUnavailableReason;
  className?: string;
  action?: React.ReactNode;
}

interface Copy {
  title: string;
  body: string;
}

/**
 * Copy avoids implying a fault. None of these are errors: the catalog is
 * curated and coordinates are verified by an operator before a restaurant
 * becomes map-eligible, so "not mapped yet" is an ordinary state.
 */
const COPY: Record<MapUnavailableReason, Copy> = {
  "no-mapped-restaurants": {
    title: "Nothing to map yet",
    body: "None of these restaurants have a verified location yet. Browsing and filtering work as normal.",
  },
  "coordinates-pending": {
    title: "Locations being verified",
    body: "Fiyu only maps a restaurant once its coordinates have been independently confirmed.",
  },
  "not-yet-available": {
    title: "Map coming next",
    body: "The Fiyu discovery map is being built. Browsing and filtering work as normal.",
  },
};

/**
 * Placeholder for the map pane.
 *
 * An unmapped catalog is a supported state rather than a failure, so this
 * renders a composed panel instead of an empty box. The faint plotted grid
 * reads as a plan view so the pane looks intentional.
 */
export function MapUnavailable({ reason, className, action }: MapUnavailableProps) {
  const { title, body } = COPY[reason];

  return (
    <div
      role="note"
      className={cn(
        "relative flex h-full min-h-64 w-full items-center justify-center overflow-hidden bg-subtle",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-line) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, var(--color-subtle) 78%)",
        }}
      />

      <div className="relative max-w-xs px-6 py-10 text-center">
        <p className="font-display text-xl text-ink">{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

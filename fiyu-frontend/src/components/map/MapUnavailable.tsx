import { cn } from "@/lib/utils/cn";

export type MapUnavailableReason = "missing-key" | "load-failed" | "no-coordinates";

export interface MapUnavailableProps {
  reason: MapUnavailableReason;
  className?: string;
}

interface Copy {
  title: string;
  body: string;
  hint?: string;
}

const COPY: Record<MapUnavailableReason, Copy> = {
  "missing-key": {
    title: "Map not configured",
    body: "Browsing, filtering and restaurant details all work without it.",
    hint: "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY",
  },
  "load-failed": {
    title: "Map could not load",
    body: "Google Maps did not respond. The restaurant list is unaffected.",
  },
  "no-coordinates": {
    title: "No mappable restaurants",
    body: "None of the restaurants matching these filters have coordinates.",
  },
};

/**
 * Stand-in for the interactive map.
 *
 * A missing browser key is an expected, supported state, not an error: the app
 * must stay fully usable before anyone provisions a Google Maps key. This
 * renders a composed panel rather than an empty box or a console error.
 */
export function MapUnavailable({ reason, className }: MapUnavailableProps) {
  const { title, body, hint } = COPY[reason];

  return (
    <div
      role="note"
      className={cn(
        "relative flex h-full min-h-64 w-full items-center justify-center overflow-hidden bg-sunken",
        className,
      )}
    >
      {/* Restrained grid suggesting a street plan, so the slot reads as a map
          placeholder rather than a broken image. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-hairline) 1px, transparent 1px), linear-gradient(90deg, var(--color-hairline) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      <div className="relative max-w-xs px-6 py-10 text-center">
        <p className="font-display text-lg text-ink">{title}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
        {hint && (
          <p className="mt-3 text-xs text-ink-faint">
            Set{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.7rem] text-ink-muted">
              {hint}
            </code>{" "}
            in <code className="font-mono text-[0.7rem]">.env.local</code> to enable it.
          </p>
        )}
      </div>
    </div>
  );
}

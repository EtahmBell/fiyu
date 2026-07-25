import { formatScore, scoreAccessibleLabel } from "@/lib/format/score";
import { cn } from "@/lib/utils/cn";

export type ScoreDialSize = "sm" | "md" | "lg";

interface DialGeometry {
  box: number;
  stroke: number;
  fontClass: string;
}

const GEOMETRY: Record<ScoreDialSize, DialGeometry> = {
  sm: { box: 40, stroke: 3, fontClass: "text-sm" },
  md: { box: 52, stroke: 3.5, fontClass: "text-lg" },
  lg: { box: 76, stroke: 4, fontClass: "text-2xl" },
};

export interface ScoreDialProps {
  score: number | null;
  size?: ScoreDialSize;
  className?: string;
}

/**
 * Fiyu score as a thin arc with the number at its centre.
 *
 * Intentionally not a star rating: Fiyu does not publish one, and star glyphs
 * would be read as a Google-style rating. The arc encodes 0-100 and the numeral
 * carries the actual value.
 */
export function ScoreDial({ score, size = "md", className }: ScoreDialProps) {
  const { box, stroke, fontClass } = GEOMETRY[size];
  const radius = (box - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const hasScore = score !== null && Number.isFinite(score);
  const fraction = hasScore ? Math.min(1, Math.max(0, score / 100)) : 0;

  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: box, height: box }}
      role="img"
      aria-label={scoreAccessibleLabel(score)}
    >
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
        {/* Rotated so the arc starts at 12 o'clock. */}
        <g transform={`rotate(-90 ${box / 2} ${box / 2})`}>
          <circle
            cx={box / 2}
            cy={box / 2}
            r={radius}
            fill="none"
            stroke="var(--color-hairline)"
            strokeWidth={stroke}
          />
          {hasScore && (
            <circle
              cx={box / 2}
              cy={box / 2}
              r={radius}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - fraction)}
            />
          )}
        </g>
      </svg>
      <span
        aria-hidden="true"
        className={cn(
          "absolute font-display tabular-nums leading-none",
          hasScore ? "text-ink" : "text-ink-faint",
          fontClass,
        )}
      >
        {formatScore(score)}
      </span>
    </div>
  );
}

import { formatFiyuScore, scoreAccessibleLabel } from "@/lib/format/score";
import { cn } from "@/lib/utils/cn";

export type ScoreMarkSize = "sm" | "md" | "lg";

const SIZES: Record<ScoreMarkSize, { numeral: string; label: string; rule: string }> = {
  sm: { numeral: "text-xl", label: "text-[0.5625rem]", rule: "w-5" },
  md: { numeral: "text-[1.75rem]", label: "text-[0.625rem]", rule: "w-7" },
  lg: { numeral: "text-[2.5rem]", label: "text-[0.6875rem]", rule: "w-9" },
};

export interface ScoreMarkProps {
  score: number | null;
  size?: ScoreMarkSize;
  className?: string;
}

/**
 * The Fiyu score as an editorial recommendation mark.
 *
 * Deliberately not a dial, ring or progress arc: those read as a finance
 * dashboard metric. This is set like a masthead credit -- a small tracked
 * wordmark, a display numeral, and a lavender rule -- so the score reads as an
 * editorial judgement rather than a measurement.
 *
 * No stars: this is Fiyu's editorial score, not an external rating.
 */
export function ScoreMark({ score, size = "md", className }: ScoreMarkProps) {
  const { numeral, label, rule } = SIZES[size];
  const hasScore = score !== null && Number.isFinite(score);

  return (
    <div
      className={cn("flex shrink-0 flex-col items-end gap-0.5", className)}
      role="img"
      aria-label={scoreAccessibleLabel(score)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "font-medium tracking-[0.18em] text-lavender-700 uppercase",
          hasScore ? "opacity-100" : "opacity-50",
          label,
        )}
      >
        Fiyu
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "font-display leading-none tabular-nums",
          hasScore ? "text-plum" : "text-ink-faint",
          numeral,
        )}
      >
        {formatFiyuScore(score)}
        {hasScore && <span className="ml-0.5 font-sans text-[0.42em] text-ink-muted">/10</span>}
      </span>
      <span
        aria-hidden="true"
        className={cn("mt-0.5 h-px rounded-full bg-lavender-500", rule, !hasScore && "opacity-30")}
      />
    </div>
  );
}

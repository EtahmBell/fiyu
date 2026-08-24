import { formatFiyuScore, scoreAccessibleLabel } from "@/lib/format/score";
import { cn } from "@/lib/utils/cn";

export type ScoreMarkSize = "sm" | "md" | "lg" | "card";

const SIZES: Record<ScoreMarkSize, { numeral: string; label: string; rule: string }> = {
  sm: { numeral: "text-xl", label: "text-[0.5625rem]", rule: "w-5" },
  md: { numeral: "text-[1.75rem]", label: "text-[0.625rem]", rule: "w-7" },
  lg: { numeral: "text-[2.5rem]", label: "text-[0.6875rem]", rule: "w-9" },
  card: {
    numeral: "text-[2rem] lg:text-[2.5rem]",
    label: "text-[0.5rem] lg:text-[0.6875rem]",
    rule: "w-6 lg:w-9",
  },
};

export interface ScoreMarkProps {
  score: number | null;
  size?: ScoreMarkSize;
  tone?: "current" | "history";
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
export function ScoreMark({ score, size = "md", tone = "current", className }: ScoreMarkProps) {
  const { numeral, label, rule } = SIZES[size];
  const hasScore = score !== null && Number.isFinite(score);

  return (
    <div
      className={cn("flex shrink-0 flex-col items-end", className)}
      role="img"
      aria-label={scoreAccessibleLabel(score)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "leading-none font-medium tracking-[0.18em] uppercase",
          tone === "history" ? "text-gold-700" : "text-lavender-700",
          hasScore ? "opacity-100" : "opacity-50",
          label,
        )}
      >
        Fiyu Score
      </span>
      {/*
       * The numeral and its denominator share one line box so `/10` sits on the
       * numeral's baseline rather than floating beside it.
       */}
      <span
        aria-hidden="true"
        className={cn(
          size === "card" ? "mt-0.5 lg:mt-1.5" : "mt-1 lg:mt-1.5",
          "font-display leading-none tabular-nums",
          hasScore ? "text-plum" : "text-ink-faint",
          numeral,
        )}
      >
        {formatFiyuScore(score)}
        {hasScore && (
          <span className="ml-1 align-baseline font-sans text-[0.42em] tracking-normal text-ink-muted">
            /10
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          size === "card" ? "mt-1 lg:mt-2" : "mt-1.5 lg:mt-2",
          "h-px rounded-full",
          tone === "history" ? "bg-gold" : "bg-lavender-500",
          rule,
          !hasScore && "opacity-30",
        )}
      />
    </div>
  );
}

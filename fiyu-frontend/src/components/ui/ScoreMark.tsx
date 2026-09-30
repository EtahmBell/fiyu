import { formatFiyuScore, hasGoldFiyuTreatment, scoreAccessibleLabel } from "@/lib/format/score";
import { cn } from "@/lib/utils/cn";

export type ScoreMarkSize = "sm" | "md" | "lg" | "card";

/*
 * One mark at four scales. The wordmark never drops below 10px: at the old
 * 8-9px it was the least legible text on the card while naming the most
 * important thing on it.
 */
const SIZES: Record<ScoreMarkSize, { numeral: string; label: string; rule: string; zone: string }> = {
  sm: { numeral: "text-[1.375rem]", label: "text-[0.625rem]", rule: "w-5", zone: "px-2.5 pt-2 pb-2.5" },
  md: { numeral: "text-[1.75rem]", label: "text-[0.6875rem]", rule: "w-6", zone: "px-3 pt-2.5 pb-3" },
  lg: { numeral: "text-[2.5rem]", label: "text-[0.6875rem]", rule: "w-8", zone: "px-4 pt-3 pb-3.5" },
  /*
   * The discovery card. 30px on a phone: with the zone behind it the numeral
   * can be a touch larger than the old free-floating 28px without out-shouting
   * the restaurant's 22px name, because the wash, not the size, is what now
   * sets it apart.
   */
  card: {
    numeral: "text-[1.875rem] lg:text-[2.25rem]",
    label: "text-[0.625rem] lg:text-[0.6875rem]",
    rule: "w-5 lg:w-6",
    zone: "px-3 pt-2.5 pb-2.5 lg:px-4 lg:pt-3.5 lg:pb-3",
  },
};

export type ScoreMarkTone = "current" | "history" | "together";

type Palette = { label: string; rule: string; zone: string };

/**
 * The wordmark, rule and zone take the tense of the surface they sit on:
 * lavender for today's Picks, champagne for a place already discovered, plum
 * for a set that belongs to a pair. The numeral never changes colour -- the
 * score is the score.
 */
const TONES: Record<ScoreMarkTone, Palette> = {
  current: { label: "text-lavender-800", rule: "bg-lavender-500", zone: "bg-lavender-50" },
  history: { label: "text-gold-700", rule: "bg-gold", zone: "bg-gold-soft/45" },
  together: { label: "text-plum-700", rule: "bg-plum-500", zone: "bg-plum-100/70" },
};

/**
 * An exceptional score (9.0+) is the one place brass meets the present tense.
 * Same type, same geometry -- only the wash and the rule turn champagne, so it
 * reads as the same mark quietly distinguished rather than as a badge.
 */
const EXCEPTIONAL: Palette = { label: "text-gold-700", rule: "bg-gold", zone: "bg-gold-soft" };

export interface ScoreMarkProps {
  score: number | null;
  size?: ScoreMarkSize;
  tone?: ScoreMarkTone;
  /**
   * Sit the mark on its tinted zone. The caller shapes the zone (usually by
   * anchoring it into a corner of the card) so it reads as part of the card's
   * construction rather than as a floating chip.
   */
  zone?: boolean;
  /** Left-aligned for inline rows; right-aligned (the default) for corners. */
  align?: "start" | "end";
  className?: string;
}

/**
 * The Fiyu Score as an editorial recommendation mark.
 *
 * Deliberately not a dial, ring or progress arc: those read as a finance
 * dashboard metric. This is set like a masthead credit -- a small tracked
 * wordmark, a serif numeral, and a short rule -- so the score reads as an
 * editorial judgement rather than a measurement.
 *
 * No stars: this is Fiyu's editorial score, not an external rating.
 */
export function ScoreMark({
  score,
  size = "md",
  tone = "current",
  zone = false,
  align = "end",
  className,
}: ScoreMarkProps) {
  const sizes = SIZES[size];
  const hasScore = score !== null && Number.isFinite(score);
  // Only the present tense is promoted: history and Together keep their own
  // accent so their tense is never overwritten by the score.
  const exceptional = tone === "current" && hasGoldFiyuTreatment(score);
  const palette = exceptional ? EXCEPTIONAL : TONES[tone];

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col",
        align === "end" ? "items-end text-right" : "items-start",
        zone && palette.zone,
        zone && sizes.zone,
        className,
      )}
      role="img"
      aria-label={scoreAccessibleLabel(score)}
      data-score-treatment={exceptional ? "exceptional" : "standard"}
    >
      <span
        aria-hidden="true"
        className={cn(
          "leading-none font-semibold tracking-[0.16em] whitespace-nowrap uppercase",
          palette.label,
          !hasScore && "opacity-60",
          sizes.label,
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
          "mt-1 font-display leading-none whitespace-nowrap tabular-nums lg:mt-1.5",
          hasScore ? "text-plum" : "text-ink-faint",
          sizes.numeral,
        )}
      >
        {formatFiyuScore(score)}
        {hasScore && (
          <span className="ml-0.5 align-baseline font-sans text-[0.4em] tracking-normal text-ink-muted">
            /10
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={cn("mt-1.5 h-0.5 rounded-full lg:mt-2", palette.rule, sizes.rule, !hasScore && "opacity-30")}
      />
    </div>
  );
}

/**
 * The same mark laid on one line, for surfaces too small for the stacked
 * version (the map popup). Rule and tracked wordmark lead, the serif numeral
 * closes the row -- identical type and colour, only the axis changes.
 */
export function ScoreLine({
  score,
  tone = "current",
  className,
}: Pick<ScoreMarkProps, "score" | "tone" | "className">) {
  const hasScore = score !== null && Number.isFinite(score);
  const exceptional = tone === "current" && hasGoldFiyuTreatment(score);
  const palette = exceptional ? EXCEPTIONAL : TONES[tone];
  return (
    <div
      className={cn("flex min-w-0 items-center justify-between gap-3", className)}
      role="img"
      aria-label={scoreAccessibleLabel(score)}
      data-score-treatment={exceptional ? "exceptional" : "standard"}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex items-center gap-2 text-[0.625rem] leading-none font-semibold tracking-[0.16em] whitespace-nowrap uppercase",
          palette.label,
        )}
      >
        <span aria-hidden="true" className={cn("h-0.5 w-4 shrink-0 rounded-full", palette.rule)} />
        Fiyu Score
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "font-display text-xl leading-none whitespace-nowrap tabular-nums",
          hasScore ? "text-plum" : "text-ink-faint",
        )}
      >
        {formatFiyuScore(score)}
        {hasScore && (
          <span className="ml-0.5 font-sans text-[0.4em] text-ink-muted">
            /10
          </span>
        )}
      </span>
    </div>
  );
}

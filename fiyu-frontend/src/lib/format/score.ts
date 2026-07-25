/**
 * Presentation rules for Fiyu's own scoring fields.
 *
 * Band values are defined in fiyu-backend/src/fiyu/public_score.py:111-130.
 * They arrive as plain strings, so every parse here is forward-compatible: an
 * unrecognised band returns null rather than throwing or rendering raw text.
 */

export const SCORE_BANDS = [
  "exceptional",
  "strong",
  "promising",
  "borderline",
  "not_recommended",
] as const;
export type ScoreBand = (typeof SCORE_BANDS)[number];

export const CONFIDENCE_BANDS = ["high", "moderate", "low", "very_low"] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

export function parseScoreBand(value: string | null): ScoreBand | null {
  return SCORE_BANDS.includes(value as ScoreBand) ? (value as ScoreBand) : null;
}

export function parseConfidenceBand(value: string | null): ConfidenceBand | null {
  return CONFIDENCE_BANDS.includes(value as ConfidenceBand) ? (value as ConfidenceBand) : null;
}

/**
 * Editorial labels for score bands.
 *
 * `not_recommended` maps to null deliberately. The backend pins a score to
 * 54.99 via the chain and low-evidence caps in public_score.py, which puts
 * three currently-published restaurants in that band. Publishing is a manual
 * operator decision (public_cli publish), so stamping "Not recommended" on a
 * row the operator chose to feature would misrepresent that decision. The
 * numeric score and confidence are still shown in full -- only the chip is
 * suppressed. Nothing is hidden or rewritten.
 */
const SCORE_BAND_LABELS: Record<ScoreBand, string | null> = {
  exceptional: "Exceptional",
  strong: "Strong",
  promising: "Promising",
  borderline: "Emerging",
  not_recommended: null,
};

const CONFIDENCE_BAND_LABELS: Record<ConfidenceBand, string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Low confidence",
  very_low: "Very low confidence",
};

/** Short chip label for a score band, or null when no chip should render. */
export function scoreBandLabel(value: string | null): string | null {
  const band = parseScoreBand(value);
  return band ? SCORE_BAND_LABELS[band] : null;
}

export function confidenceBandLabel(value: string | null): string | null {
  const band = parseConfidenceBand(value);
  return band ? CONFIDENCE_BAND_LABELS[band] : null;
}

/** Placeholder shown wherever a numeric field is absent. */
export const MISSING_VALUE = "—";

/**
 * Fiyu score for display. Backend sends 2dp; a whole number reads better in an
 * editorial layout. Sorting always uses the raw value, never this string.
 */
export function formatScore(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return MISSING_VALUE;
  return String(Math.round(score));
}

/** Confidence percentage for display, e.g. "73%". */
export function formatConfidence(confidence: number | null): string {
  if (confidence === null || !Number.isFinite(confidence)) return MISSING_VALUE;
  return `${Math.round(confidence)}%`;
}

/**
 * Map a 0-100 backend signal onto 0-1 for meters and ranking.
 * Out-of-range values are clamped rather than rejected, so a future backend
 * change cannot break rendering.
 */
export function normalizeSignal(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value / 100));
}

/**
 * Screen-reader description of a score. Avoids implying a star rating, which
 * Fiyu does not publish.
 */
export function scoreAccessibleLabel(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return "Fiyu score unavailable";
  return `Fiyu score ${Math.round(score)} out of 100`;
}

/**
 * Presentation rules for GoogleLiveDetails.
 *
 * The backend normaliser (fiyu-backend/src/fiyu/google_places.py:101-113)
 * coerces every missing Google value to "" / 0.0 / 0 instead of null. So the
 * wire type says `rating: float` but the semantic type is
 * `float | unknown`. Everything here treats 0/"" as "not provided" rather than
 * as a real value, which is why callers must not test these fields directly.
 */

import type { GoogleLiveDetails } from "@/lib/api/schemas";

/** Google returns 0 when it has no rating. Never display a "0.0" rating. */
export function isRatingKnown(details: Pick<GoogleLiveDetails, "rating" | "rating_count">): boolean {
  return details.rating_count > 0 && details.rating > 0;
}

export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

/** e.g. "24 Google reviews" / "1 Google review". */
export function formatRatingCount(count: number): string {
  const formatted = new Intl.NumberFormat("en-US").format(count);
  return `${formatted} Google ${count === 1 ? "review" : "reviews"}`;
}

export interface PriceLevelDisplay {
  /** Compact glyph, e.g. "¥¥". */
  symbol: string;
  /** Full text for screen readers and tooltips. */
  label: string;
}

/**
 * Google's priceLevel enum. PRICE_LEVEL_UNSPECIFIED and any unknown future
 * value return null so nothing is invented.
 */
const PRICE_LEVELS: Record<string, PriceLevelDisplay> = {
  PRICE_LEVEL_FREE: { symbol: "Free", label: "Free" },
  PRICE_LEVEL_INEXPENSIVE: { symbol: "¥", label: "Inexpensive" },
  PRICE_LEVEL_MODERATE: { symbol: "¥¥", label: "Moderate" },
  PRICE_LEVEL_EXPENSIVE: { symbol: "¥¥¥", label: "Expensive" },
  PRICE_LEVEL_VERY_EXPENSIVE: { symbol: "¥¥¥¥", label: "Very expensive" },
};

export function formatPriceLevel(priceLevel: string | null): PriceLevelDisplay | null {
  if (!priceLevel) return null;
  return PRICE_LEVELS[priceLevel] ?? null;
}

export interface OpeningStatus {
  label: string;
  tone: "open" | "closed" | "unknown";
}

/**
 * `open_now` is a point-in-time boolean computed by Google with no timezone
 * context attached, so it is reported as-is and never recomputed locally.
 */
export function formatOpenStatus(openNow: boolean | null): OpeningStatus {
  if (openNow === null) return { label: "Hours unconfirmed", tone: "unknown" };
  return openNow ? { label: "Open now", tone: "open" } : { label: "Closed now", tone: "closed" };
}

export interface WeekdayHours {
  day: string;
  hours: string;
  /** Google localises these strings; "Closed" detection is English-only. */
  isClosed: boolean;
}

/**
 * Split Google's `weekdayDescriptions` lines into day/hours pairs.
 *
 * Input looks like "Monday: 5:00 – 9:10 PM" (or the Japanese equivalent when
 * language_code=ja). Splitting on the first ": " avoids the colons inside the
 * times themselves. Lines that do not match are passed through whole rather
 * than dropped.
 */
export function parseWeekdayHours(lines: string[]): WeekdayHours[] {
  return lines.map((line) => {
    const separator = line.indexOf(": ");
    if (separator === -1) {
      return { day: line, hours: "", isClosed: false };
    }
    const day = line.slice(0, separator).trim();
    const hours = line.slice(separator + 2).trim();
    return { day, hours, isClosed: /^closed$/i.test(hours) };
  });
}

/**
 * Index into `weekday_hours` for "today" in Tokyo.
 *
 * Google returns weekdayDescriptions Monday-first, so we resolve the Tokyo
 * weekday numerically rather than by matching the localised day name -- which
 * would otherwise break when language_code=ja.
 *
 * Returns null when the list is not the expected 7 entries.
 */
export function tokyoWeekdayIndex(now: Date): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(now);
  const mondayFirst = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return Math.max(0, mondayFirst.indexOf(weekday));
}

export function todaysHours(lines: string[], now: Date): WeekdayHours | null {
  if (lines.length !== 7) return null;
  return parseWeekdayHours(lines)[tokyoWeekdayIndex(now)] ?? null;
}

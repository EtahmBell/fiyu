import { describe, expect, it } from "vitest";

import {
  formatOpenStatus,
  formatPriceLevel,
  formatRatingCount,
  isRatingKnown,
  parseWeekdayHours,
  todaysHours,
  tokyoWeekdayIndex,
} from "@/lib/format/google";
import liveDetailsFixture from "@/test/fixtures/live-details.json";

describe("isRatingKnown", () => {
  it("treats the backend's zero-coercion as unknown, not as a zero rating", () => {
    // google_places.py coerces a missing rating to 0.0 and a missing count to 0.
    expect(isRatingKnown({ rating: 0, rating_count: 0 })).toBe(false);
    expect(isRatingKnown({ rating: 0, rating_count: 12 })).toBe(false);
    expect(isRatingKnown({ rating: 4.9, rating_count: 0 })).toBe(false);
  });

  it("accepts a genuine rating", () => {
    expect(isRatingKnown({ rating: 4.9, rating_count: 24 })).toBe(true);
    expect(isRatingKnown(liveDetailsFixture)).toBe(true);
  });
});

describe("formatRatingCount", () => {
  it("pluralises and groups thousands", () => {
    expect(formatRatingCount(1)).toBe("1 Google review");
    expect(formatRatingCount(24)).toBe("24 Google reviews");
    expect(formatRatingCount(1234)).toBe("1,234 Google reviews");
  });
});

describe("formatPriceLevel", () => {
  it("maps the Google enum to a glyph and a label", () => {
    expect(formatPriceLevel("PRICE_LEVEL_MODERATE")).toEqual({
      symbol: "¥¥",
      label: "Moderate",
    });
    expect(formatPriceLevel("PRICE_LEVEL_VERY_EXPENSIVE")?.symbol).toBe("¥¥¥¥");
  });

  it("invents nothing for unspecified, unknown or absent values", () => {
    expect(formatPriceLevel("PRICE_LEVEL_UNSPECIFIED")).toBeNull();
    expect(formatPriceLevel("PRICE_LEVEL_FUTURE")).toBeNull();
    expect(formatPriceLevel(null)).toBeNull();
  });
});

describe("formatOpenStatus", () => {
  it("reports the three distinct states", () => {
    expect(formatOpenStatus(true)).toEqual({ label: "Open now", tone: "open" });
    expect(formatOpenStatus(false)).toEqual({ label: "Closed now", tone: "closed" });
    // null means Google returned no currentOpeningHours -- not "closed".
    expect(formatOpenStatus(null)).toEqual({ label: "Hours unconfirmed", tone: "unknown" });
  });
});

describe("parseWeekdayHours", () => {
  it("splits on the first ': ' so times keep their own colons", () => {
    expect(parseWeekdayHours(["Monday: 5:00 – 9:10 PM"])).toEqual([
      { day: "Monday", hours: "5:00 – 9:10 PM", isClosed: false },
    ]);
  });

  it("flags closed days", () => {
    expect(parseWeekdayHours(["Wednesday: Closed"])[0].isClosed).toBe(true);
  });

  it("passes unparseable lines through instead of dropping them", () => {
    expect(parseWeekdayHours(["Open 24 hours"])).toEqual([
      { day: "Open 24 hours", hours: "", isClosed: false },
    ]);
  });

  it("parses the real fixture into seven days", () => {
    const parsed = parseWeekdayHours(liveDetailsFixture.weekday_hours);
    expect(parsed).toHaveLength(7);
    expect(parsed[0].day).toBe("Monday");
    expect(parsed.filter((entry) => entry.isClosed)).toHaveLength(2);
  });
});

describe("tokyoWeekdayIndex", () => {
  it("resolves Monday-first indices in Asia/Tokyo", () => {
    // 2026-07-20T00:00Z is Monday 09:00 in Tokyo.
    expect(tokyoWeekdayIndex(new Date("2026-07-20T00:00:00Z"))).toBe(0);
    expect(tokyoWeekdayIndex(new Date("2026-07-26T00:00:00Z"))).toBe(6);
  });

  it("uses Tokyo time, not UTC, across the date boundary", () => {
    // 2026-07-20T20:00Z is already Tuesday 05:00 in Tokyo.
    expect(tokyoWeekdayIndex(new Date("2026-07-20T20:00:00Z"))).toBe(1);
  });
});

describe("todaysHours", () => {
  it("indexes numerically, so it works for ja-localised day names too", () => {
    const japanese = [
      "月曜日: 17時00分～21時10分",
      "火曜日: 17時00分～21時10分",
      "水曜日: 定休日",
      "木曜日: 定休日",
      "金曜日: 17時00分～21時10分",
      "土曜日: 17時00分～21時10分",
      "日曜日: 17時00分～21時10分",
    ];
    expect(todaysHours(japanese, new Date("2026-07-22T00:00:00Z"))?.day).toBe("水曜日");
  });

  it("returns Wednesday's entry from the real English fixture", () => {
    const entry = todaysHours(liveDetailsFixture.weekday_hours, new Date("2026-07-22T00:00:00Z"));
    expect(entry?.day).toBe("Wednesday");
    expect(entry?.isClosed).toBe(true);
  });

  it("returns null when the list is not a full week", () => {
    expect(todaysHours(["Monday: 9 AM – 5 PM"], new Date("2026-07-20T00:00:00Z"))).toBeNull();
    expect(todaysHours([], new Date("2026-07-20T00:00:00Z"))).toBeNull();
  });
});

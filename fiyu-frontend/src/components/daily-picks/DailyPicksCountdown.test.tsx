// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DailyPicksCountdown,
  formatPicksCountdown,
} from "@/components/daily-picks/DailyPicksCountdown";

afterEach(cleanup);

describe("Daily Picks countdown", () => {
  it("formats hours and minutes without seconds", () => {
    expect(formatPicksCountdown((21 * 60 + 34) * 60_000)).toBe("21h 34m");
    expect(formatPicksCountdown(42 * 60_000)).toBe("42m");
    expect(formatPicksCountdown(60 * 60_000)).toBe("1h");
    expect(formatPicksCountdown(61_000)).toBe("1m");
    expect(formatPicksCountdown(59_000)).toBe("1m");
  });

  it("floors a fresh daily round and only clamps the narrow clock-skew window", () => {
    expect(formatPicksCountdown(24 * 60 * 60_000)).toBe("23h 59m");
    expect(formatPicksCountdown(24 * 60 * 60_000 + 60_000)).toBe("23h 59m");
    expect(formatPicksCountdown(24 * 60 * 60_000 + 3 * 60_000)).toBe("24h 3m");
  });

  it("shows the ready state at the eligibility boundary", () => {
    const boundary = Date.UTC(2026, 7, 30, 12);
    render(<DailyPicksCountdown expiresAt={new Date(boundary).toISOString()} now={boundary} />);

    expect(screen.getByText("Next Picks")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.queryByText(/\d+s/)).toBeNull();
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DailyCardFrame } from "@/components/daily-picks/DailyCardFrame";

afterEach(cleanup);

describe("DailyCardFrame semantic selection accents", () => {
  it("uses lavender for current Picks and brass for recent discoveries", () => {
    const { rerender } = render(
      <DailyCardFrame placeId="one" selected>
        <span>Current</span>
      </DailyCardFrame>,
    );
    const frame = screen.getByText("Current").parentElement;
    expect(frame?.className).toContain("--color-lavender-500");

    rerender(
      <DailyCardFrame placeId="one" selected tone="history">
        <span>History</span>
      </DailyCardFrame>,
    );
    expect(screen.getByText("History").parentElement?.className).toContain("--color-gold");
  });
});

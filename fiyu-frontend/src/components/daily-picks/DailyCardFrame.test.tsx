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

  it("draws selection flush with the card so it never reads as a second line", () => {
    render(
      <DailyCardFrame placeId="one" selected>
        <article>Card</article>
      </DailyCardFrame>,
    );
    const frame = screen.getByText("Card").parentElement;
    expect(frame?.className).toContain("shadow-[0_0_0_1px_var(--color-lavender-500)]");
    expect(frame?.className).toContain("[&_article]:border-lavender-500!");
    expect(frame?.className).not.toContain("0_0_0_3px");
  });
});

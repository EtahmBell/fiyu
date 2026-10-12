// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DailyCardFrame } from "@/components/daily-picks/DailyCardFrame";

afterEach(cleanup);

describe("DailyCardFrame semantic selection accents", () => {
  it("uses lavender for current Picks and dusty blue for recent discoveries", () => {
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
    expect(screen.getByText("History").parentElement?.className).toContain("--color-discovery");
  });

  it("keeps Personalized Pick selection on its warm ochre token", () => {
    render(
      <DailyCardFrame placeId="one" selected tone="personalized">
        <span>Personalized</span>
      </DailyCardFrame>,
    );
    expect(screen.getByText("Personalized").parentElement?.className).toContain(
      "--color-personalized",
    );
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

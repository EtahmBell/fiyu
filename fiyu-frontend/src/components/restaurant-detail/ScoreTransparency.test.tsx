// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import AboutPage from "@/app/(marketing)/about/page";
import { ScoreTransparency } from "./ScoreTransparency";
import { publicRestaurantDetailSchema } from "@/lib/api/schemas";

afterEach(cleanup);

const restaurant = publicRestaurantDetailSchema.parse({
  place_id: "transparency", fiyu_score: 91,
  score_transparency: {
    reasons: ["Stored research identifies a single independent restaurant."],
    model_label: "Current scoring model", evidence_confidence: "Moderate",
    signals: [{ key: "quality_signal", label: "Quality signal", value: 9.3, description: "Rating evidence adjusted for review volume." }],
  },
});

it("shows evidence separately from a native, keyboard-accessible signal disclosure", () => {
  render(<ScoreTransparency restaurant={restaurant} />);
  expect(screen.getByRole("heading", { name: "Why Fiyu found it" })).toBeTruthy();
  expect(screen.getByText(restaurant.score_transparency!.reasons[0])).toBeTruthy();
  const summary = screen.getByText("Signals behind the score");
  expect(summary.tagName).toBe("SUMMARY");
  const disclosure = summary.closest("details")!;
  expect(disclosure.open).toBe(false);
  fireEvent.click(summary);
  expect(disclosure.open).toBe(true);
  expect(screen.getByText("Quality signal")).toBeTruthy();
  expect(screen.getByText("9.3")).toBeTruthy();
  expect(screen.getByText(/simple average does not produce/)).toBeTruthy();
  expect(screen.getByText(/Research confidence: Moderate/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "How Fiyu scores places" }).getAttribute("href")).toBe("/about#how-fiyu-scores");
  fireEvent.click(summary);
  expect(disclosure.open).toBe(false);
});

it.each([undefined, null])("handles absent legacy explanation without inventing evidence (%s)", (value) => {
  const legacy = publicRestaurantDetailSchema.parse({ place_id: "legacy", score_transparency: value });
  render(<ScoreTransparency restaurant={legacy} />);
  expect(screen.getByText("Detailed discovery evidence is not available for this restaurant.")).toBeTruthy();
  fireEvent.click(screen.getByText("Signals behind the score"));
  expect(screen.getByText(/published score has not been recalculated/)).toBeTruthy();
  expect(screen.queryByText(/Research confidence:/)).toBeNull();
});

it("keeps schema values bounded and score independent from the transparency payload", () => {
  expect(restaurant.fiyu_score).toBe(91);
  expect(publicRestaurantDetailSchema.safeParse({
    ...restaurant, score_transparency: { ...restaurant.score_transparency, signals: [{ key: "bad", label: "bad", value: 11, description: "bad" }] },
  }).success).toBe(false);
});

it("provides an anchored methodology without claiming current personalization or simple averages", () => {
  render(<AboutPage />);
  expect(screen.getByRole("heading", { name: "How Fiyu scores places" }).closest("section")?.id).toBe("how-fiyu-scores");
  expect(screen.getByText(/provisional discovery score/)).toBeTruthy();
  expect(screen.getByText(/Low exposure alone does not establish quality/)).toBeTruthy();
  expect(screen.getByText(/45%/)).toBeTruthy();
  expect(screen.getByText(/Historical models used 30%/)).toBeTruthy();
  expect(screen.getByText(/not a prediction of your personal rating/)).toBeTruthy();
});

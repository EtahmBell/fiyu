import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(process.cwd(), "src/components/pick-reveal/PickReveal.module.css"),
  "utf8",
);

describe("shared concealed Pick design", () => {
  it("uses one compact bounded frame for every Pick variant", () => {
    expect(css).toContain("--pick-card-aspect-ratio: 16 / 9");
    expect(css).toContain("width: 100%");
    expect(css).toContain("max-block-size: 15rem");
  });

  it("uses semantic regular and Personalized stationery surfaces", () => {
    expect(css).toContain("var(--color-pick-card-surface)");
    expect(css).toContain("var(--color-pick-card-personalized-surface)");
    expect(css).toContain("var(--shadow-pick-card)");
  });

  it("has no clipped watermark, static diagonal rule, or ornamental gradient", () => {
    expect(css).not.toContain(".hiddenSurface::before");
    expect(css).not.toContain(".hiddenSurface::after");
    expect(css).not.toContain('content: "F"');
    expect(css).not.toContain("rotate(32deg)");
  });

  it("keeps the shared reduced-motion override and restrained hover lift", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("transform: translateY(-1px)");
    expect(css).toContain("transition: opacity 150ms ease-out");
  });
});

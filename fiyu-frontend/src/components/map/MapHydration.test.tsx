// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FiyuMap } from "@/components/map/FiyuMap";
import { publicRestaurantSchema } from "@/lib/api/schemas";
import { selectBrowsable } from "@/lib/discovery/filters";
import { type MappableRestaurant, mappableRestaurants } from "@/lib/geo/mappable";
import { LANDMARKS } from "@/lib/map/landmarks";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

/**
 * Server/client agreement for the map, and the landmark pictograms.
 *
 * WHY A REAL HYDRATION TEST. The existing determinism tests assert that rendered
 * numbers are rounded, which catches float divergence -- but it cannot catch a
 * mismatch with a non-numeric cause. This one does the actual thing: renders to a
 * string, hydrates that markup, and fails on any React console error.
 *
 * It was added after `<title>{a} — {b}</title>` in MapLandmarks shipped a real
 * mismatch. Three JSX children on a `<title>` are serialised differently by the
 * server renderer and by the client, and React regenerates the whole tree.
 */

// React needs this to treat act() as supported outside a test renderer.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const catalog = restaurantsFixture.map((row) => publicRestaurantSchema.parse(row));
const browsable: MappableRestaurant[] = mappableRestaurants(selectBrowsable(catalog).restaurants);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function mapElement() {
  return <FiyuMap restaurants={browsable} selectedPlaceId={null} onSelect={() => {}} />;
}

/** Hydrate server markup and collect anything React complains about. */
async function hydrateAndCollectErrors(): Promise<{ errors: string[]; container: HTMLElement }> {
  const element = mapElement();
  const container = document.createElement("div");
  container.innerHTML = renderToString(element);
  document.body.appendChild(container);

  const errors: string[] = [];
  vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args.map((arg) => String(arg)).join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation((...args) => {
    errors.push(args.map((arg) => String(arg)).join(" "));
  });

  await act(async () => {
    hydrateRoot(container, element);
  });

  return { errors, container };
}

describe("server and client render the same map", () => {
  it("hydrates with no mismatch and no React warning", async () => {
    const { errors } = await hydrateAndCollectErrors();
    expect(errors).toEqual([]);
  });

  it("keeps all restaurant pins through hydration", async () => {
    const { container } = await hydrateAndCollectErrors();
    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(browsable.length);
    expect(container.querySelectorAll('[data-location-approximate="true"]')).toHaveLength(0);
  });

  it("produces byte-identical markup on two server renders", () => {
    expect(renderToString(mapElement())).toBe(renderToString(mapElement()));
  });

  it("gives every SVG title exactly one text child", () => {
    // The specific shape that broke hydration. A `<title>` with interpolated
    // siblings is an array, and arrays are not serialised consistently.
    const html = renderToString(mapElement());
    const titles = [...html.matchAll(/<title[^>]*>(.*?)<\/title>/g)].map((match) => match[1]);
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) {
      expect(title).not.toContain("<!-- -->");
    }
  });

  it("renders the map key without a mismatch once opened", async () => {
    // Opening is a post-hydration state change, so this guards the interaction
    // the mismatch was first noticed through.
    render(mapElement());
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map((arg) => String(arg)).join(" "));
    });

    fireEvent.click(screen.getByRole("button", { name: /map key/i }));

    expect(screen.getByText("Restaurant")).toBeTruthy();
    expect(screen.queryByText("Approximate area")).toBeNull();
    expect(errors).toEqual([]);
  });
});

describe("landmark pictograms", () => {
  function icons(): SVGElement[] {
    const { container } = render(mapElement());
    return [...container.querySelectorAll('[data-layer="landmarks"] svg')] as SVGElement[];
  }

  it("draws one icon per visible landmark", () => {
    const expected = LANDMARKS.filter((landmark) => landmark.minDetail === 1).length;
    expect(icons()).toHaveLength(expected);
  });

  it("normalises every icon onto a 24x24 grid", () => {
    for (const icon of icons()) {
      expect(icon.getAttribute("viewBox")).toBe("0 0 24 24");
    }
  });

  it("uses strokes and currentColor, never a solid fill", () => {
    // The blob bug: a stroke width in parent units, scaled ~11x by the wrapper
    // transform, swallowed each glyph. Stroke-only geometry on a normalised grid
    // is what prevents it recurring.
    for (const icon of icons()) {
      expect(icon.getAttribute("fill")).toBe("none");
      expect(icon.getAttribute("stroke")).toBe("currentColor");
      for (const path of icon.querySelectorAll("path")) {
        expect(path.getAttribute("fill")).toBeNull();
      }
    }
  });

  it("keeps a stroke width that stays a hairline relative to the grid", () => {
    for (const icon of icons()) {
      const width = Number(icon.getAttribute("stroke-width"));
      // Anything past ~3 on a 24-unit grid starts closing the shapes up.
      expect(width).toBeGreaterThan(0);
      expect(width).toBeLessThanOrEqual(3);
    }
  });

  /**
   * Checks APPARENT size, not the raw attribute.
   *
   * The icon divides by the map scale so it stays the same size on screen, and the
   * default view is auto-fitted to the catalog (k ~= 1.78), so the attribute is
   * ~11 viewBox units. What matters is width x k, which is what a user sees.
   */
  it("renders at roughly 18-22px on screen, at any zoom", () => {
    const { container } = render(mapElement());
    const transform = container.querySelector("g[transform]")?.getAttribute("transform") ?? "";
    const scale = Number(/scale\(([\d.]+)\)/.exec(transform)?.[1] ?? "1");
    expect(scale).toBeGreaterThan(0);

    const iconNodes = [...container.querySelectorAll('[data-layer="landmarks"] svg')];
    expect(iconNodes.length).toBeGreaterThan(0);

    for (const icon of iconNodes) {
      const apparent = Number(icon.getAttribute("width")) * scale;
      expect(apparent).toBeGreaterThanOrEqual(18);
      expect(apparent).toBeLessThanOrEqual(22);
      expect(icon.getAttribute("height")).toBe(icon.getAttribute("width"));
    }
  });

  it("rounds icon positions and sizes for deterministic markup", () => {
    for (const icon of icons()) {
      for (const attribute of ["x", "y", "width", "height"]) {
        expect(icon.getAttribute(attribute)).toMatch(/^-?\d+(\.\d{1,2})?$/);
      }
    }
  });

  it("gives distinct landmarks distinct pictograms", () => {
    const glyphs = LANDMARKS.map((landmark) => landmark.glyph);
    // Tokyo Station and the National Diet previously shared one.
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it("still labels each icon for assistive tech and hover", () => {
    for (const icon of icons()) {
      expect(icon.getAttribute("role")).toBe("img");
      expect(icon.getAttribute("aria-label")).toMatch(/landmark$/);
      expect(icon.querySelector("title")?.textContent).toContain("—");
    }
  });
});

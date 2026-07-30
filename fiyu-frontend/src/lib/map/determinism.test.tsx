// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FiyuMap } from "@/components/map/FiyuMap";
import { publicRestaurantSchema } from "@/lib/api/schemas";
import { selectBrowsable } from "@/lib/discovery/filters";
import { type MappableRestaurant, mappableRestaurants } from "@/lib/geo/mappable";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

/**
 * Guards the hydration fix at the level that actually matters: the rendered
 * attribute strings.
 *
 * Math.log and Math.tan are implementation-defined (ECMAScript §21.3.2), so Node
 * and the browser can differ by ~1 ULP. project() amplifies that roughly 209x
 * through catastrophic cancellation in `NORTH_Y - mercatorY(lat)`, and React
 * compares attributes as strings -- so a raw projected float is a hydration
 * mismatch waiting to happen.
 *
 * Asserting the SHAPE of every numeric attribute, rather than specific values at
 * specific call sites, is what makes this durable: it fails for any new attribute
 * anyone adds without rounding, anywhere in the map subtree.
 */

/** Numbers written into SVG geometry. All must be rounded before rendering. */
const NUMERIC_ATTRIBUTES = [
  "x",
  "y",
  "cx",
  "cy",
  "r",
  "width",
  "height",
  "font-size",
  "stroke-width",
  "letter-spacing",
];

/** At most two decimal places, matching SVG_DECIMALS. */
const ROUNDED = /^-?\d+(\.\d{1,2})?$/;

const catalog = restaurantsFixture.map((row) => publicRestaurantSchema.parse(row));

/** Everything the backend cleared for the map: five restaurants. */
const mappable: MappableRestaurant[] = mappableRestaurants(catalog);

/**
 * What the map actually receives, mirroring DiscoveryShell: the browsable
 * catalog, which withholds the not_recommended band. Four pins, and at the
 * initial fit they occupy four distinct grid cells, so each renders as its own
 * mark. Using this set keeps the DOM assertions below stable and realistic --
 * the unfiltered five would cluster あたらよ with 牛たんの檸檬 (~350 m apart, both
 * 神田佐久間町), which is correct behaviour but makes mark counts a moving target.
 */
const browsable: MappableRestaurant[] = mappableRestaurants(
  selectBrowsable(catalog).restaurants,
);

afterEach(cleanup);

function renderMap(restaurants: MappableRestaurant[] = browsable) {
  return render(
    <FiyuMap restaurants={restaurants} selectedPlaceId={null} onSelect={() => {}} />,
  );
}

describe("rendered SVG geometry", () => {
  it("has real coordinates to project", () => {
    expect(mappable.length).toBe(5);
    expect(browsable.length).toBe(4);
  });

  it("writes no over-precise number into any numeric attribute", () => {
    const { container } = renderMap();
    const offenders: string[] = [];

    for (const element of container.querySelectorAll("*")) {
      for (const name of NUMERIC_ATTRIBUTES) {
        const value = element.getAttribute(name);
        if (value === null || value === "") continue;
        if (!ROUNDED.test(value)) {
          offenders.push(`<${element.tagName} ${name}="${value}">`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("writes a bounded transform rather than a full-precision one", () => {
    const { container } = renderMap();
    const transforms = [...container.querySelectorAll("[transform]")].map(
      (element) => element.getAttribute("transform") as string,
    );

    expect(transforms.length).toBeGreaterThan(0);
    for (const transform of transforms) {
      expect(transform).toMatch(
        /^translate\(-?\d+(\.\d{1,2})? -?\d+(\.\d{1,2})?\) scale\(\d+(\.\d{1,6})?\)$/,
      );
    }
  });

  it("writes no over-precise number into any path", () => {
    const { container } = renderMap();
    for (const path of container.querySelectorAll("path")) {
      const d = path.getAttribute("d") ?? "";
      // Three or more decimals anywhere in the geometry.
      expect(d).not.toMatch(/\d\.\d{3,}/);
    }
  });

  it("writes no over-precise number into a dash pattern", () => {
    // Dashed base-geography lines are scale-divided.
    const { container } = renderMap();
    const dashed = [...container.querySelectorAll("[stroke-dasharray]")];
    expect(dashed.length).toBeGreaterThan(0);
    for (const element of dashed) {
      for (const part of (element.getAttribute("stroke-dasharray") as string).split(/[\s,]+/)) {
        if (part !== "") expect(part).toMatch(ROUNDED);
      }
    }
  });

  it("renders identically when the same input is rendered twice", () => {
    // Not a cross-engine check, but it does catch anything non-pure sneaking in.
    const first = renderMap().container.innerHTML;
    cleanup();
    const second = renderMap().container.innerHTML;
    expect(first).toBe(second);
  });
});

describe("approximate locations remain on the discovery map", () => {
  it("plots each chome-anchored restaurant alongside exact locations", () => {
    const { container } = renderMap();
    // Of the four browsable pins, two are chome anchors and two are precise.
    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(4);
    const approximateIds = browsable
      .filter((restaurant) => restaurant.map_location_approximate)
      .map((restaurant) => restaurant.place_id);
    expect(approximateIds).toHaveLength(2);
    for (const placeId of approximateIds) {
      expect(container.querySelector(`[data-place-id="${placeId}"]`)).toBeTruthy();
    }
  });

  it("uses the regular pin treatment without frontend approximate-area tags", () => {
    const { container } = renderMap();
    const approximateIds = browsable
      .filter((restaurant) => restaurant.map_location_approximate)
      .map((restaurant) => restaurant.place_id);
    for (const placeId of approximateIds) {
      const marker = container.querySelector(`[data-place-id="${placeId}"]`);
      expect(marker?.getAttribute("aria-label")).not.toContain("Approximate area");
      expect(marker?.querySelector("title")?.textContent).not.toContain("Approximate area");
      expect(marker?.querySelector("[stroke-dasharray]")).toBeNull();
      expect(marker?.innerHTML).toContain("var(--map-marker-center)");
    }
  });
});

describe("out-of-bounds coordinates", () => {
  it("plots only restaurants inside the illustrated area", () => {
    const osaka = publicRestaurantSchema.parse({
      place_id: "osaka",
      name_en: "Somewhere in Osaka",
      latitude: 34.6937,
      longitude: 135.5023,
      map_display_eligible: true,
      location_precision: "exact",
      distance_sort_eligible: true,
    });
    const [outside] = mappableRestaurants([osaka]);

    const { container } = renderMap([...browsable, outside]);
    // The Tokyo pins still render at their normal fit; the far-away one is left
    // off entirely, so it cannot widen the bounding box, collapse the scale and
    // shove every other pin into a corner.
    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(4);
    expect(container.querySelector('[data-place-id="osaka"]')).toBeNull();
  });

  it("frames the in-bounds pins the same with or without the outlier", () => {
    const withoutOutlier = renderMap().container
      .querySelector("[transform]")
      ?.getAttribute("transform");
    cleanup();

    const osaka = publicRestaurantSchema.parse({
      place_id: "osaka",
      latitude: 34.6937,
      longitude: 135.5023,
      map_display_eligible: true,
      distance_sort_eligible: true,
    });
    const withOutlier = renderMap([...browsable, ...mappableRestaurants([osaka])]).container
      .querySelector("[transform]")
      ?.getAttribute("transform");

    expect(withOutlier).toBe(withoutOutlier);
  });
});

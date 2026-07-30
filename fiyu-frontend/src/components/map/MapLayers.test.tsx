// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FiyuMap } from "@/components/map/FiyuMap";
import { publicRestaurantSchema } from "@/lib/api/schemas";
import { selectBrowsable } from "@/lib/discovery/filters";
import { type MappableRestaurant, mappableRestaurants } from "@/lib/geo/mappable";
import { DETAIL_THRESHOLDS } from "@/lib/map/detail";
import { GEOGRAPHY_STATS, OSM_ATTRIBUTION, STATIONS } from "@/lib/map/geography";
import { LANDMARKS } from "@/lib/map/landmarks";
import restaurantsFixture from "@/test/fixtures/restaurants.json";

/**
 * The detailed base map.
 *
 * Two things are being defended here. First, that the geography actually renders
 * -- a silently empty layer would look like a design choice rather than a broken
 * asset pipeline. Second, and more importantly, that adding all of it did not
 * disturb the restaurant pins: they must stay present, stay distinct, stay on top
 * and stay clickable.
 */

const catalog = restaurantsFixture.map((row) => publicRestaurantSchema.parse(row));
const browsable: MappableRestaurant[] = mappableRestaurants(selectBrowsable(catalog).restaurants);

afterEach(cleanup);

function renderMap(overrides: Partial<Parameters<typeof FiyuMap>[0]> = {}) {
  return render(
    <FiyuMap
      restaurants={browsable}
      selectedPlaceId={null}
      onSelect={() => {}}
      {...overrides}
    />,
  );
}

/** Zoom by pressing the control, which is how a keyboard user changes detail. */
function zoomIn(times: number) {
  for (let i = 0; i < times; i += 1) {
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  }
}

describe("generated geography", () => {
  it("loaded a non-empty asset for every layer", () => {
    // A zero here means `fiyu export-map-assets` was never run, or ran against a
    // PBF that does not cover Tokyo.
    for (const [layer, count] of Object.entries(GEOGRAPHY_STATS)) {
      expect(count, `layer ${layer} is empty`).toBeGreaterThan(0);
    }
  });

  it("carries OpenStreetMap attribution", () => {
    expect(OSM_ATTRIBUTION).toMatch(/OpenStreetMap/);
    expect(OSM_ATTRIBUTION).toMatch(/ODbL/);
  });

  it("keeps every station inside the map extent", () => {
    // isWithinBounds already filters in geography.ts; this pins that it worked.
    for (const station of STATIONS) {
      expect(station.at.lat).toBeGreaterThanOrEqual(35.52);
      expect(station.at.lat).toBeLessThanOrEqual(35.82);
      expect(station.at.lng).toBeGreaterThanOrEqual(139.56);
      expect(station.at.lng).toBeLessThanOrEqual(139.92);
    }
  });

  it("renders the base layers as a handful of combined paths, not thousands", () => {
    // The whole point of combining subpaths: DOM size must not scale with the
    // amount of geography.
    const { container } = renderMap();
    const paths = container.querySelectorAll("path[data-layer]");
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.length).toBeLessThan(20);
  });
});

describe("layer visibility by zoom", () => {
  it("shows water, parks, wards, major roads and rail at the default view", () => {
    const { container } = renderMap();
    for (const layer of ["wards", "parks", "water", "waterways", "roads-major", "rail-surface"]) {
      expect(container.querySelector(`[data-layer="${layer}"]`), layer).toBeTruthy();
    }
  });

  it("withholds secondary roads and subway lines at the default view", () => {
    const { container } = renderMap();
    expect(container.querySelector('[data-layer="roads-secondary"]')).toBeNull();
    expect(container.querySelector('[data-layer="rail-subway"]')).toBeNull();
  });

  it("adds secondary roads and subway lines once zoomed in", () => {
    const { container } = renderMap();
    // Two presses of 1.5x from k=1 clears the level-2 threshold.
    zoomIn(2);
    expect(container.querySelector('[data-layer="roads-secondary"]')).toBeTruthy();
    expect(container.querySelector('[data-layer="rail-subway"]')).toBeTruthy();
    expect(DETAIL_THRESHOLDS[2]).toBeLessThanOrEqual(1.5 ** 2);
  });

  it("keeps overview layers visible at every zoom, so detail is additive", () => {
    const { container } = renderMap();
    zoomIn(3);
    for (const layer of ["water", "parks", "roads-major", "rail-surface"]) {
      expect(container.querySelector(`[data-layer="${layer}"]`), layer).toBeTruthy();
    }
  });

  it("shows more station labels as the map zooms in", () => {
    const { container } = renderMap();
    const countStations = () =>
      container.querySelectorAll('[data-layer="stations"] circle').length;

    const atOverview = countStations();
    zoomIn(3);
    const atStreet = countStations();

    expect(atOverview).toBeGreaterThan(0);
    expect(atStreet).toBeGreaterThan(atOverview);
  });

  /**
   * REGRESSION GUARD. Several wards share a name with their main station, and the
   * ward centroid sits a few hundred metres from the concourse -- so "Shinjuku"
   * and "Shibuya" were each drawn twice, a centimetre apart.
   */
  it("never draws the same place name twice", () => {
    const { container } = renderMap();
    const texts = [...container.querySelectorAll("text")]
      .map((node) => node.textContent ?? "")
      .filter((text) => text.length > 0);

    const seen = new Map<string, number>();
    for (const text of texts) seen.set(text, (seen.get(text) ?? 0) + 1);
    const duplicated = [...seen.entries()].filter(([, count]) => count > 1);

    expect(duplicated.map(([text, count]) => `${text} x${count}`)).toEqual([]);
  });

  it("prefers the station label over the identically-named ward label", () => {
    const { container } = renderMap();
    const texts = [...container.querySelectorAll("text")].map((node) => node.textContent);

    // Present exactly once, and it is the station: the ward label yielded.
    expect(texts.filter((text) => text === "Shinjuku")).toHaveLength(1);
    // A ward with no same-named station keeps its label.
    expect(texts).toContain("Chiyoda");
  });

  it("drops ward names at the closest zoom, where stations carry orientation", () => {
    const { container } = renderMap();
    const wardName = () => [...container.querySelectorAll("text")].some((node) => node.textContent === "Chiyoda");

    expect(wardName()).toBe(true);
    zoomIn(3);
    expect(wardName()).toBe(false);
  });
});

describe("stations and landmarks are context, not restaurants", () => {
  it("gives no station a place id", () => {
    const { container } = renderMap();
    const stations = container.querySelector('[data-layer="stations"]');
    expect(stations).toBeTruthy();
    expect(stations?.querySelectorAll("[data-place-id]")).toHaveLength(0);
  });

  it("gives no landmark a place id", () => {
    const { container } = renderMap();
    const landmarks = container.querySelector('[data-layer="landmarks"]');
    expect(landmarks).toBeTruthy();
    expect(landmarks?.querySelectorAll("[data-place-id]")).toHaveLength(0);
  });

  it("counts place ids equal to the restaurants passed in, and no more", () => {
    // The strongest form: adding stations and landmarks must not inflate the
    // number of things that look like a Fiyu record.
    const { container } = renderMap();
    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(browsable.length);
  });

  it("never lets a station or landmark swallow a restaurant click", () => {
    const { container } = renderMap();
    for (const selector of ['[data-layer="stations"]', '[data-layer="landmarks"]']) {
      const layer = container.querySelector(selector);
      // The layer itself is transparent to pointers; only the small mark inside
      // re-enables them for its tooltip.
      expect(layer?.getAttribute("class")).toContain("pointer-events-none");
    }
  });

  it("labels stations and landmarks for assistive tech without making them buttons", () => {
    const { container } = renderMap();
    const marks = container.querySelectorAll(
      '[data-layer="stations"] [role="img"], [data-layer="landmarks"] [role="img"]',
    );
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) {
      expect(mark.getAttribute("aria-label")).toBeTruthy();
      // A restaurant pin is role=button; context marks must not be.
      expect(mark.getAttribute("role")).toBe("img");
    }
  });

  it("gives every station and landmark mark a tooltip title", () => {
    const { container } = renderMap();
    const marks = container.querySelectorAll(
      '[data-layer="stations"] [role="img"], [data-layer="landmarks"] [role="img"]',
    );
    for (const mark of marks) {
      expect(mark.querySelector("title")?.textContent).toBeTruthy();
    }
  });

  it("makes landmarks reachable by keyboard", () => {
    const { container } = renderMap();
    const focusable = container.querySelectorAll('[data-layer="landmarks"] [tabindex="0"]');
    expect(focusable.length).toBeGreaterThan(0);
  });

  /**
   * Stations are context with no action, and there are dozens at close zoom.
   * Making each one a tab stop would put forty inert stops between a keyboard user
   * and the restaurants they came for. They stay reachable by screen reader and by
   * hover tooltip instead.
   */
  it("does not put every station in the tab order", () => {
    const { container } = renderMap();
    expect(container.querySelectorAll('[data-layer="stations"] [tabindex]')).toHaveLength(0);
  });

  it("keeps the tab order short enough to reach a restaurant pin", () => {
    const { container } = renderMap();
    const stops = container.querySelectorAll("svg [tabindex]");
    // 8 landmarks at most, plus the restaurant pins themselves.
    expect(stops.length).toBeLessThanOrEqual(LANDMARKS.length + browsable.length);
  });

  it("renders a landmark glyph for each landmark visible at the overview", () => {
    const { container } = renderMap();
    const expected = LANDMARKS.filter((landmark) => landmark.minDetail === 1).length;
    expect(container.querySelectorAll('[data-layer="landmarks"] [role="img"]')).toHaveLength(
      expected,
    );
  });
});

describe("restaurant pins survive the new geography", () => {
  it("still renders every browsable mapped restaurant", () => {
    const { container } = renderMap();
    expect(container.querySelectorAll("[data-place-id]")).toHaveLength(4);
  });

  it("still distinguishes exact from approximate pins", () => {
    const { container } = renderMap();
    expect(container.querySelectorAll('[data-location-approximate="true"]')).toHaveLength(2);
  });

  it("still says 'Approximate area' on approximate pins", () => {
    const { container } = renderMap();
    for (const pin of container.querySelectorAll('[data-location-approximate="true"]')) {
      expect(pin.getAttribute("aria-label")).toContain("Approximate area");
    }
  });

  it("draws pins after every context layer, so nothing overdraws them", () => {
    const { container } = renderMap();
    const svg = container.querySelector("svg");
    const order = [...(svg?.querySelectorAll("[data-layer], [data-place-id]") ?? [])];

    const lastContext = order.reduce(
      (last, node, index) => (node.hasAttribute("data-layer") ? index : last),
      -1,
    );
    const firstPin = order.findIndex((node) => node.hasAttribute("data-place-id"));

    expect(firstPin).toBeGreaterThan(-1);
    expect(firstPin).toBeGreaterThan(lastContext);
  });

  it("keeps restaurant pins as keyboard-activatable buttons", () => {
    const onSelect = vi.fn();
    const { container } = renderMap({ onSelect });
    const pin = container.querySelector("[data-place-id]") as HTMLElement;
    expect(pin.getAttribute("role")).toBe("button");
    fireEvent.click(pin);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("map key", () => {
  it("offers a key covering the four mark types", () => {
    renderMap();
    fireEvent.click(screen.getByRole("button", { name: /map key/i }));

    for (const label of ["Exact location", "Approximate area", "Station", "Landmark"]) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
  });

  it("credits OpenStreetMap whether the key is open or closed", () => {
    renderMap();
    expect(screen.getByRole("link", { name: OSM_ATTRIBUTION })).toBeTruthy();
  });

  it("says the geography is simplified and not for navigation", () => {
    renderMap();
    fireEvent.click(screen.getByRole("button", { name: /map key/i }));
    expect(screen.getByText(/not for navigation/i)).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FiyuMap } from "@/components/map/FiyuMap";
import { publicRestaurantSchema } from "@/lib/api/schemas";
import { type MappableRestaurant, mappableRestaurants } from "@/lib/geo/mappable";

/**
 * Fixture coordinates. These are real Tokyo positions used to drive the
 * component under test; they are NOT restaurant location data and must never
 * leak into production code.
 */
function mappable(
  place_id: string,
  lat: number,
  lng: number,
  extra: Record<string, unknown> = {},
): MappableRestaurant {
  const parsed = publicRestaurantSchema.parse({
    place_id,
    latitude: lat,
    longitude: lng,
    location_precision: "exact",
    map_display_eligible: true,
    ...extra,
  });
  const [only] = mappableRestaurants([parsed]);
  if (!only) throw new Error("fixture is not mappable");
  return only;
}

const SHIBUYA = mappable("shibuya", 35.658, 139.7016, { name_ja: "渋谷の店" });
const UENO = mappable("ueno", 35.7141, 139.7774, { name_ja: "上野の店" });

/**
 * The map surface.
 *
 * Queried by accessible name rather than by role alone: stations and landmarks
 * are also role="img", so a bare getByRole("img") is ambiguous.
 */
function mapSurface(): HTMLElement {
  return screen.getByRole("img", { name: /Map of Tokyo/ });
}

afterEach(cleanup);

describe("map surface", () => {
  it("describes itself and its marker count to assistive tech", () => {
    render(<FiyuMap restaurants={[SHIBUYA, UENO]} selectedPlaceId={null} onSelect={() => {}} />);
    expect(mapSurface().getAttribute("aria-label")).toBe(
      "Map of Tokyo showing 2 restaurants.",
    );
  });

  it("says so plainly when nothing is mapped", () => {
    render(<FiyuMap restaurants={[]} selectedPlaceId={null} onSelect={() => {}} />);
    expect(mapSurface().getAttribute("aria-label")).toContain(
      "No restaurants are currently mapped",
    );
  });

  it("renders one marker per mappable restaurant", () => {
    render(<FiyuMap restaurants={[SHIBUYA, UENO]} selectedPlaceId={null} onSelect={() => {}} />);
    expect(screen.getByLabelText("渋谷の店")).toBeTruthy();
    expect(screen.getByLabelText("上野の店")).toBeTruthy();
  });
});

describe("card and marker selection stay in sync", () => {
  it("marks the selected restaurant's pin as pressed", () => {
    render(
      <FiyuMap restaurants={[SHIBUYA, UENO]} selectedPlaceId="shibuya" onSelect={() => {}} />,
    );
    expect(screen.getByLabelText("渋谷の店").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("上野の店").getAttribute("aria-pressed")).toBe("false");
  });

  it("moves the pressed state when the selection changes", () => {
    const { rerender } = render(
      <FiyuMap restaurants={[SHIBUYA, UENO]} selectedPlaceId="shibuya" onSelect={() => {}} />,
    );
    rerender(
      <FiyuMap restaurants={[SHIBUYA, UENO]} selectedPlaceId="ueno" onSelect={() => {}} />,
    );
    expect(screen.getByLabelText("渋谷の店").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByLabelText("上野の店").getAttribute("aria-pressed")).toBe("true");
  });

  it("does not pan, recenter, or change zoom when a card selects a pin", () => {
    const { rerender } = render(
      <FiyuMap restaurants={[SHIBUYA, UENO]} selectedPlaceId={null} onSelect={() => {}} />,
    );
    const content = mapSurface().querySelector("g[transform]") as SVGGElement;
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const before = content.getAttribute("transform") ?? "";

    rerender(
      <FiyuMap restaurants={[SHIBUYA, UENO]} selectedPlaceId="ueno" onSelect={() => {}} />,
    );

    expect(content.getAttribute("transform")).toBe(before);
  });

  it("reports the restaurant when its pin is clicked", () => {
    const onSelect = vi.fn();
    render(<FiyuMap restaurants={[SHIBUYA, UENO]} selectedPlaceId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText("上野の店"));
    expect(onSelect).toHaveBeenCalledWith(UENO);
  });

  it("activates a pin from the keyboard", () => {
    const onSelect = vi.fn();
    render(<FiyuMap restaurants={[SHIBUYA]} selectedPlaceId={null} onSelect={onSelect} />);
    const marker = screen.getByLabelText("渋谷の店");
    expect(marker.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(marker, { key: "Enter" });
    fireEvent.keyDown(marker, { key: " " });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});

describe("controls", () => {
  it("exposes zoom, fit and reset as real keyboard-reachable buttons", () => {
    render(<FiyuMap restaurants={[SHIBUYA, UENO]} selectedPlaceId={null} onSelect={() => {}} />);
    for (const name of [
      "Zoom in",
      "Zoom out",
      "Fit results in view",
      "Reset to the whole map",
    ]) {
      expect(screen.getByRole("button", { name }), name).toBeTruthy();
    }
  });

  it("disables Fit when there is nothing to frame", () => {
    render(<FiyuMap restaurants={[]} selectedPlaceId={null} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Fit results in view" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("disables Zoom out at the whole-map view and enables it after zooming in", () => {
    render(<FiyuMap restaurants={[]} selectedPlaceId={null} onSelect={() => {}} />);
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    expect(zoomOut).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("button", { name: "Zoom out" })).toHaveProperty("disabled", false);
  });

  it("returns to the whole-map view when Reset is pressed", () => {
    render(<FiyuMap restaurants={[SHIBUYA, UENO]} selectedPlaceId={null} onSelect={() => {}} />);
    const surface = mapSurface();

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset to the whole map" }));

    const group = surface.querySelector("g");
    expect(group?.getAttribute("transform")).toBe("translate(0 0) scale(1)");
    expect(screen.getByRole("button", { name: "Zoom out" })).toHaveProperty("disabled", true);
  });

  it("stops zooming in at the documented maximum", () => {
    render(<FiyuMap restaurants={[]} selectedPlaceId={null} onSelect={() => {}} />);
    for (let i = 0; i < 15; i += 1) {
      const button = screen.getByRole("button", { name: "Zoom in" });
      if ((button as HTMLButtonElement).disabled) break;
      fireEvent.click(button);
    }
    expect(screen.getByRole("button", { name: "Zoom in" })).toHaveProperty("disabled", true);

    const transform = mapSurface().querySelector("g")?.getAttribute("transform") ?? "";
    const scale = Number(transform.match(/scale\(([\d.]+)\)/)?.[1]);
    expect(scale).toBeLessThanOrEqual(4);
  });
});

describe("clustering on the map", () => {
  it("collapses overlapping restaurants into a count marker", () => {
    // Two points a few metres apart share a grid cell at the default zoom.
    const a = mappable("a", 35.658, 139.7016);
    const b = mappable("b", 35.6582, 139.7018);
    render(<FiyuMap restaurants={[a, b]} selectedPlaceId={null} onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: /2 restaurants in this area/ })).toBeTruthy();
  });

  it("does not describe a cluster in terms of popularity", () => {
    const a = mappable("a", 35.658, 139.7016);
    const b = mappable("b", 35.6582, 139.7018);
    render(<FiyuMap restaurants={[a, b]} selectedPlaceId={null} onSelect={() => {}} />);

    const label =
      screen.getByRole("button", { name: /2 restaurants in this area/ }).getAttribute("aria-label") ??
      "";
    expect(label).not.toMatch(/popular|trending|busy|favourite|favorite/i);
  });
});

describe("map-ineligible restaurants", () => {
  it("cannot be constructed as map input", () => {
    // The type guard is the gate; this documents that ineligible rows never
    // reach the map component at all.
    const ineligible = publicRestaurantSchema.parse({
      place_id: "hidden",
      latitude: 35.68,
      longitude: 139.76,
      location_precision: "exact",
      map_display_eligible: false,
    });
    expect(mappableRestaurants([ineligible])).toEqual([]);
  });

  it("renders no markers when the eligible set is empty", () => {
    render(<FiyuMap restaurants={[]} selectedPlaceId={null} onSelect={() => {}} />);
    expect(screen.queryAllByRole("button", { name: /restaurant/i })).toEqual([]);
  });
});

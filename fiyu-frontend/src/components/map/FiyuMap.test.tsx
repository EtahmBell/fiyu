// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FiyuMap } from "@/components/map/FiyuMap";
import { publicRestaurantSchema } from "@/lib/api/schemas";
import { type MappableRestaurant, mappableRestaurants } from "@/lib/geo/mappable";
import { publishNewlyRevealedMapPlaces } from "@/lib/map/revealEvents";
import { clearMapViewportSessions, saveMapViewportSession } from "@/lib/map/viewportSession";

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

const WEST_TOKYO = mappable("west-tokyo", 35.67, 139.58, { name_en: "West Tokyo fixture" });
const EAST_TOKYO = mappable("east-tokyo", 35.67, 139.9, { name_en: "East Tokyo fixture" });

/**
 * The map surface.
 *
 * Queried by accessible name rather than by role alone: stations and landmarks
 * are also role="img", so a bare getByRole("img") is ambiguous.
 */
function mapSurface(): HTMLElement {
  return screen.getByRole("img", { name: /Map of Tokyo/ });
}

afterEach(() => {
  cleanup();
  clearMapViewportSessions();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
  it("does not request viewport motion for an already-safe selected pin", () => {
    const animation = vi.spyOn(window, "requestAnimationFrame");
    render(
      <FiyuMap restaurants={[SHIBUYA, UENO]} selectedPlaceId="shibuya" onSelect={() => {}} />,
    );
    expect(animation).not.toHaveBeenCalled();
  });

  it("marks the selected restaurant's pin as pressed", () => {
    render(
      <FiyuMap restaurants={[SHIBUYA, UENO]} selectedPlaceId="shibuya" onSelect={() => {}} />,
    );
    expect(mapSurface().querySelector('[data-layer="restaurant-popup"]')).toBeNull();
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

  it("does not schedule the same automatic selection transition twice", async () => {
    saveMapViewportSession("selection-repeat", {
      resultKey: "west-tokyo|east-tokyo",
      view: { x: -3000, y: -1500, k: 4 },
    });
    const animation = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(() => 1);
    const { rerender } = render(
      <FiyuMap
        restaurants={[WEST_TOKYO, EAST_TOKYO]}
        selectedPlaceId="west-tokyo"
        onSelect={() => {}}
        viewportSessionKey="selection-repeat"
      />,
    );
    await waitFor(() => expect(animation).toHaveBeenCalledTimes(1));

    rerender(
      <FiyuMap
        restaurants={[WEST_TOKYO, EAST_TOKYO]}
        selectedPlaceId="west-tokyo"
        onSelect={() => {}}
        viewportSessionKey="selection-repeat"
      />,
    );
    expect(animation).toHaveBeenCalledTimes(1);
  });

  it("repositions without animation when reduced motion is requested", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    saveMapViewportSession("selection-reduced-motion", {
      resultKey: "west-tokyo|east-tokyo",
      view: { x: -3000, y: -1500, k: 4 },
    });
    const animation = vi.spyOn(window, "requestAnimationFrame");
    render(
      <FiyuMap
        restaurants={[WEST_TOKYO, EAST_TOKYO]}
        selectedPlaceId="west-tokyo"
        onSelect={() => {}}
        viewportSessionKey="selection-reduced-motion"
      />,
    );

    await waitFor(() => {
      const transform = mapSurface().querySelector("g[transform]")?.getAttribute("transform") ?? "";
      expect(transform).not.toBe("translate(-3000 -1500) scale(4)");
    });
    expect(animation).not.toHaveBeenCalled();
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

describe("newly revealed map pins", () => {
  it("sprouts the matching marker once and preserves each viewport when all revealed pins are visible", () => {
    vi.useFakeTimers();
    render(
      <>
        <FiyuMap restaurants={[SHIBUYA, UENO]} selectedPlaceId={null} onSelect={() => {}} />
        <FiyuMap restaurants={[SHIBUYA, UENO]} selectedPlaceId={null} onSelect={() => {}} />
      </>,
    );
    const maps = screen.getAllByRole("img", { name: /Map of Tokyo/ });
    const before = maps.map(
      (map) => map.querySelector("g[transform]")?.getAttribute("transform") ?? "",
    );
    const shibuyaPins = screen.getAllByLabelText("渋谷の店");
    expect(shibuyaPins).toHaveLength(2);
    expect(shibuyaPins.every((pin) => !pin.hasAttribute("data-newly-revealed"))).toBe(true);

    act(() => {
      publishNewlyRevealedMapPlaces(
        ["shibuya"],
        Date.UTC(2026, 6, 30, 12),
        ["shibuya", "ueno"],
      );
    });

    expect(shibuyaPins.every((pin) => pin.getAttribute("data-newly-revealed") === "true")).toBe(
      true,
    );
    expect(shibuyaPins.every((pin) => pin.classList.contains("fiyu-map-pin-sprout"))).toBe(true);
    expect(
      maps.map((map) => map.querySelector("g[transform]")?.getAttribute("transform") ?? ""),
    ).toEqual(before);

    act(() => vi.advanceTimersByTime(600));
    expect(shibuyaPins.every((pin) => !pin.hasAttribute("data-newly-revealed"))).toBe(true);
  });

  it("fits all currently revealed pins when a genuine reveal falls outside the viewport", () => {
    render(
      <FiyuMap
        restaurants={[WEST_TOKYO, EAST_TOKYO]}
        selectedPlaceId={null}
        onSelect={() => {}}
      />,
    );
    const content = mapSurface().querySelector("g[transform]") as SVGGElement;
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const before = content.getAttribute("transform") ?? "";
    const beforeScale = Number(before.match(/scale\(([\d.]+)\)/)?.[1]);

    act(() => {
      publishNewlyRevealedMapPlaces(
        ["east-tokyo"],
        Date.UTC(2026, 6, 30, 12),
        ["west-tokyo", "east-tokyo"],
      );
    });

    const after = content.getAttribute("transform") ?? "";
    const afterScale = Number(after.match(/scale\(([\d.]+)\)/)?.[1]);
    expect(after).not.toBe(before);
    expect(afterScale).toBeLessThanOrEqual(beforeScale);
    expect(screen.getByLabelText("East Tokyo fixture").getAttribute("data-newly-revealed")).toBe(
      "true",
    );
  });

  it("does not replay an old reveal on a map mounted later", () => {
    act(() => {
      publishNewlyRevealedMapPlaces(["shibuya"], Date.UTC(2026, 6, 30, 12));
    });

    render(<FiyuMap restaurants={[SHIBUYA]} selectedPlaceId={null} onSelect={() => {}} />);

    const marker = screen.getByLabelText("渋谷の店");
    expect(marker.hasAttribute("data-newly-revealed")).toBe(false);
    expect(marker.classList.contains("fiyu-map-pin-sprout")).toBe(false);
  });

  it("ignores reveal events for places not plotted on that map", () => {
    render(<FiyuMap restaurants={[SHIBUYA]} selectedPlaceId={null} onSelect={() => {}} />);
    const marker = screen.getByLabelText("渋谷の店");

    act(() => {
      publishNewlyRevealedMapPlaces(["not-on-this-map"], Date.UTC(2026, 6, 30, 12));
    });

    expect(marker.hasAttribute("data-newly-revealed")).toBe(false);
  });
});

describe("controls", () => {
  it("restores an application map transform without re-fitting on a matching result set", () => {
    const first = render(
      <FiyuMap
        restaurants={[SHIBUYA, UENO]}
        selectedPlaceId={null}
        onSelect={() => {}}
        viewportSessionKey="detail-test"
      />,
    );
    const map = mapSurface();
    const content = map.querySelector("g[transform]") as SVGGElement;
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const changedTransform = content.getAttribute("transform");
    first.unmount();

    render(
      <FiyuMap
        restaurants={[SHIBUYA, UENO]}
        selectedPlaceId="shibuya"
        onSelect={() => {}}
        viewportSessionKey="detail-test"
      />,
    );

    expect((mapSurface().querySelector("g[transform]") as SVGGElement).getAttribute("transform")).toBe(
      changedTransform,
    );
  });

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

    const clusterButton = screen.getByRole("button", { name: /2 restaurants in this area/ });
    expect(clusterButton.className).toContain("bg-transparent");
    expect(clusterButton.className).not.toContain("border-2");
    expect(screen.getByText("2", { selector: "svg text" })).toBeTruthy();
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

  it("zooms a close cluster until its member markers separate", async () => {
    const a = mappable("a", 35.6978436, 139.7741913, { name_en: "Restaurant A" });
    const b = mappable("b", 35.69797502625716, 139.77817065934673, {
      name_en: "Restaurant B",
    });
    saveMapViewportSession("cluster-interaction", {
      resultKey: "a|b",
      view: { x: 0, y: 0, k: 1 },
    });
    const { container } = render(
      <FiyuMap
        restaurants={[a, b]}
        selectedPlaceId={null}
        onSelect={() => {}}
        viewportSessionKey="cluster-interaction"
      />,
    );

    const content = mapSurface().querySelector("g[transform]") as SVGGElement;
    const before = content.getAttribute("transform");
    const nativeAnimation = window.requestAnimationFrame.bind(window);
    const animation = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => nativeAnimation(callback));
    fireEvent.click(screen.getByRole("button", { name: /2 restaurants in this area/ }));

    expect(content.getAttribute("transform")).toBe(before);
    expect(animation).toHaveBeenCalled();

    await waitFor(() => {
      expect(container.querySelector('[data-marker-kind="restaurant-cluster"]')).toBeNull();
      expect(container.querySelectorAll('[data-marker-kind="restaurant"]')).toHaveLength(2);
    });
  });

  it("lists every restaurant when coincident markers cannot separate at maximum zoom", () => {
    const onSelect = vi.fn();
    const a = mappable("a", 35.658, 139.7016, { name_en: "Restaurant A" });
    const b = mappable("b", 35.658, 139.7016, { name_en: "Restaurant B" });
    render(<FiyuMap restaurants={[a, b]} selectedPlaceId={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /2 restaurants in this area/ }));

    expect(screen.getByTestId("map-cluster-picker")).toBeTruthy();
    const restaurantB = screen.getByRole("button", { name: /Restaurant B/ });
    fireEvent.click(restaurantB);
    expect(onSelect).toHaveBeenCalledWith(b);
    expect(screen.queryByTestId("map-cluster-picker")).toBeNull();
  });

  it("keeps Picks markers individually selectable by place_id, including collisions", () => {
    const onSelect = vi.fn();
    const a = mappable("a", 35.658, 139.7016, { name_en: "Restaurant A" });
    const b = mappable("b", 35.6582, 139.7018, { name_en: "Restaurant B" });
    const c = mappable("c", 35.658, 139.7016, { name_en: "Restaurant C" });
    const { container } = render(
      <FiyuMap
        restaurants={[a, b, c]}
        selectedPlaceId={null}
        onSelect={onSelect}
        clusterNearbyRestaurants={false}
      />,
    );

    expect(container.querySelectorAll('[data-marker-kind="restaurant"]')).toHaveLength(3);
    for (const restaurant of [a, b, c]) {
      const marker = container.querySelector(`[data-place-id="${restaurant.place_id}"]`);
      expect(marker).toBeTruthy();
      fireEvent.click(marker as Element);
      expect(onSelect).toHaveBeenLastCalledWith(restaurant);
    }
    expect(container.querySelector('[data-marker-kind="restaurant-cluster"]')).toBeNull();
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

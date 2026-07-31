// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CityEmptyState,
  CityLoadingSequence,
} from "@/components/city-signature/CitySignature";
import { TokyoKikuMark, TokyoOdenIllustration } from "@/components/city-signature/TokyoArtwork";
import { TOKYO_CITY_SIGNATURE, citySignatureFor } from "@/lib/city/signatures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function motionPreference(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: reduced,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

beforeEach(() => motionPreference(false));

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("Tokyo City Signature", () => {
  it("registers one reusable, complete Tokyo identity", () => {
    expect(citySignatureFor("tokyo")).toBe(TOKYO_CITY_SIGNATURE);
    expect(TOKYO_CITY_SIGNATURE.loadingIllustrations).toHaveLength(5);
    expect(Object.keys(TOKYO_CITY_SIGNATURE.emptyStateIllustrations ?? {}).sort()).toEqual([
      "discoveries",
      "lists",
      "saved",
      "visits",
    ]);
    expect(citySignatureFor("new-york")).toBeNull();
  });

  it("uses a custom seven-petal mark rather than an Imperial arrangement", () => {
    const { container } = render(<TokyoKikuMark />);
    expect(container.querySelectorAll("ellipse")).toHaveLength(7);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("registers the five food illustrations in oden, bowl, fish, onigiri, mochi order", () => {
    expect(
      (TOKYO_CITY_SIGNATURE.loadingIllustrations ?? []).map((Illustration) => Illustration.name),
    ).toEqual([
      "TokyoOdenIllustration",
      "TokyoNoodleIllustration",
      "TokyoFishIllustration",
      "TokyoOnigiriIllustration",
      "TokyoMochiIllustration",
    ]);
  });

  it("plays five normalized food illustrations once, 600ms each, and holds", () => {
    vi.useFakeTimers();
    const { container } = render(<CityLoadingSequence cityId="tokyo" />);
    const sequence = screen.getByTestId("city-loading-sequence");
    const illustrations = [...container.querySelectorAll("[data-loading-illustration]")];
    expect(illustrations).toHaveLength(5);
    expect(illustrations.map((item) => item.getAttribute("viewBox"))).toEqual([
      "0 0 120 96",
      "0 0 120 96",
      "0 0 120 96",
      "0 0 120 96",
      "0 0 120 96",
    ]);
    // Every frame is decorative; the visible "Finding today's restaurants…"
    // text is what conveys the status.
    for (const illustration of illustrations) {
      expect(illustration.getAttribute("aria-hidden")).toBe("true");
    }

    // Oden through mochi, one step per 600ms: three seconds of sequence.
    expect(sequence.dataset.activeIllustration).toBe("0");
    for (const expected of ["1", "2", "3", "4"]) {
      act(() => vi.advanceTimersByTime(600));
      expect(sequence.dataset.activeIllustration).toBe(expected);
    }

    // Then it holds on the mochi and stops its timer rather than wrapping back
    // to the oden underneath the fading loading state.
    act(() => vi.advanceTimersByTime(6_000));
    expect(sequence.dataset.activeIllustration).toBe("4");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("crossfades rather than swapping, holding exactly one frame opaque", () => {
    vi.useFakeTimers();
    const { container } = render(<CityLoadingSequence cityId="tokyo" />);
    const opacity = () =>
      [...container.querySelectorAll("[data-loading-illustration]")].map((item) =>
        item.getAttribute("class")?.includes("opacity-100") ? "on" : "off",
      );

    expect(opacity()).toEqual(["on", "off", "off", "off", "off"]);
    act(() => vi.advanceTimersByTime(600));
    expect(opacity()).toEqual(["off", "on", "off", "off", "off"]);
    expect(
      container.querySelector("[data-loading-illustration]")?.getAttribute("class"),
    ).toContain("transition-opacity");
  });

  it("draws the oden as a skewer carrying a circle, a triangle and a rounded piece", () => {
    const { container } = render(<TokyoOdenIllustration />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 120 96");

    // One rotated group, so the pieces sit on the skewer rather than near it.
    const group = svg?.querySelector("g[transform]");
    expect(group?.getAttribute("transform")).toBe("rotate(38 60 50)");
    expect(group?.querySelector("circle")).toBeTruthy();
    expect(group?.querySelector("rect")?.getAttribute("rx")).toBe("7");

    // Every piece is centred on the skewer's x axis and inside the viewBox.
    const skewer = group?.querySelector("path[d^='M60 90']");
    expect(skewer?.getAttribute("d")).toBe("M60 90V6");
    expect(group?.querySelector("circle")?.getAttribute("cx")).toBe("60");
    const piece = group?.querySelector("rect");
    expect(Number(piece?.getAttribute("x")) + Number(piece?.getAttribute("width")) / 2).toBe(60);

    // Open strokes must not inherit the SVG default of solid black.
    for (const shape of svg?.querySelectorAll("path, rect, circle, ellipse") ?? []) {
      expect(shape.getAttribute("fill")).not.toBeNull();
      expect(shape.getAttribute("stroke-linecap")).toBe("round");
      expect(shape.getAttribute("stroke-width")).toBe("3");
    }
  });

  it("never leaves an open path to fall back to a solid black fill", () => {
    for (const Illustration of TOKYO_CITY_SIGNATURE.loadingIllustrations ?? []) {
      const { container, unmount } = render(<Illustration />);
      for (const shape of container.querySelectorAll("path, rect, circle, ellipse")) {
        expect(shape.getAttribute("fill")).not.toBeNull();
      }
      unmount();
    }
  });

  it("holds the noodle bowl static for reduced-motion users and runs no timer", () => {
    motionPreference(true);
    vi.useFakeTimers();
    render(<CityLoadingSequence cityId="tokyo" />);
    const sequence = screen.getByTestId("city-loading-sequence");

    act(() => vi.advanceTimersByTime(8_000));
    expect(sequence.dataset.activeIllustration).toBe("1");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears its interval on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = render(<CityLoadingSequence cityId="tokyo" />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hydrates on frame zero without a mismatch", async () => {
    const element = <CityLoadingSequence cityId="tokyo" />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);
    expect(
      container.querySelector("[data-testid='city-loading-sequence']")?.getAttribute(
        "data-active-illustration",
      ),
    ).toBe("0");

    const messages: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => messages.push(args.map(String).join(" ")));
    vi.spyOn(console, "warn").mockImplementation((...args) => messages.push(args.map(String).join(" ")));

    await act(async () => {
      hydrateRoot(container, element);
    });

    expect(messages).toEqual([]);
  });

  it("renders compact decorative empty-state variants without inventing actions", () => {
    const { container } = render(
      <CityEmptyState
        cityId="tokyo"
        kind="visits"
        title="No visits logged"
        description="Visit logging is not available yet."
      />,
    );
    expect(screen.getByText("No visits logged")).toBeTruthy();
    expect(container.querySelector("[data-city-empty-state='visits'] svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    const illustration = container.querySelector('[data-visits-empty-illustration="plain-noren"]');
    expect(illustration).toBeTruthy();
    expect(illustration?.querySelector('path[d="m67 84 7 7 16-18"]')).toBeNull();
    expect(container.querySelector("a, button")).toBeNull();
  });
});

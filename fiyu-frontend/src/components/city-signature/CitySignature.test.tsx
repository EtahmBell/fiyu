// @vitest-environment jsdom
import { act } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CityEmptyState,
  CityLoadingSequence,
} from "@/components/city-signature/CitySignature";
import { TokyoKikuMark } from "@/components/city-signature/TokyoArtwork";
import { TOKYO_CITY_SIGNATURE, citySignatureFor } from "@/lib/city/signatures";

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

  it("cycles five normalized food illustrations in a fixed 800ms sequence", () => {
    vi.useFakeTimers();
    const { container } = render(<CityLoadingSequence cityId="tokyo" />);
    const sequence = screen.getByTestId("city-loading-sequence");
    const illustrations = container.querySelectorAll("[data-loading-illustration]");
    expect(illustrations).toHaveLength(5);
    expect([...illustrations].map((item) => item.getAttribute("viewBox"))).toEqual([
      "0 0 120 96",
      "0 0 120 96",
      "0 0 120 96",
      "0 0 120 96",
      "0 0 120 96",
    ]);
    expect(sequence.dataset.activeIllustration).toBe("0");

    act(() => vi.advanceTimersByTime(800));
    expect(sequence.dataset.activeIllustration).toBe("1");
    act(() => vi.advanceTimersByTime(3_200));
    expect(sequence.dataset.activeIllustration).toBe("0");
  });

  it("keeps the first loading illustration static for reduced-motion users", () => {
    motionPreference(true);
    vi.useFakeTimers();
    render(<CityLoadingSequence cityId="tokyo" />);
    const sequence = screen.getByTestId("city-loading-sequence");

    act(() => vi.advanceTimersByTime(8_000));
    expect(sequence.dataset.activeIllustration).toBe("0");
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

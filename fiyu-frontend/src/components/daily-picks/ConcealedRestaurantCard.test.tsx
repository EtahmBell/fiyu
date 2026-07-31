// @vitest-environment jsdom
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { ConcealedRestaurantCard } from "@/components/daily-picks/ConcealedRestaurantCard";
import { publicRestaurantSchema } from "@/lib/api/schemas";

function fixture(score: number) {
  return publicRestaurantSchema.parse({
    place_id: `score-${score}`,
    name_ja: "鮨さいとう",
    name_en: "Sushi Saito",
    description_en: "Edomae sushi presented with quiet precision.",
    category: "Sushi",
    neighborhood: "Roppongi",
    fiyu_score: score,
    food_tags: ["江戸前", "寿司"],
    signature_dishes: ["おまかせ"],
    external_map_search_query: "東京都港区六本木1-1",
  });
}

afterEach(cleanup);

describe("concealed daily restaurant card", () => {
  it("hides all identifying restaurant content until reveal", () => {
    render(
      <ConcealedRestaurantCard
        restaurant={fixture(88)}
        position={1}
        revealed={false}
        saved={false}
        onReveal={() => {}}
        onToggleSaved={() => {}}
      />,
    );

    expect(screen.queryByText("鮨さいとう")).toBeNull();
    expect(screen.queryByText("Sushi Saito")).toBeNull();
    expect(screen.queryByText(/quiet precision/)).toBeNull();
    expect(screen.queryByLabelText(/Fiyu score/)).toBeNull();
    const reveal = screen.getByRole("button", { name: "Tap to reveal restaurant 1" });
    expect(reveal.className).toContain("focus-visible:outline-2");
    expect(reveal.className).toContain("focus-visible:outline-lavender-600");
    expect(reveal.className).not.toContain("focus-visible:outline-none");
    reveal.focus();
    expect(document.activeElement).toBe(reveal);
  });

  it("reveals the full card and uses the shared ten-point score", () => {
    const onReveal = vi.fn();
    const props = {
      restaurant: fixture(90),
      position: 2,
      saved: false,
      onReveal,
      onToggleSaved: () => {},
    };
    const { rerender } = render(<ConcealedRestaurantCard {...props} revealed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Tap to reveal restaurant 2" }));
    expect(onReveal).toHaveBeenCalledOnce();

    rerender(<ConcealedRestaurantCard {...props} revealed />);
    expect(screen.getByText("鮨さいとう")).toBeTruthy();
    expect(screen.getByText("Sushi Saito")).toBeTruthy();
    expect(screen.getByLabelText("Fiyu score 9.0 out of 10")).toBeTruthy();
    expect(screen.getByText("/10")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("applies gold treatment at 90 but not below", () => {
    const { rerender } = render(
      <ConcealedRestaurantCard
        restaurant={fixture(90)}
        position={1}
        revealed={false}
        saved={false}
        onReveal={() => {}}
        onToggleSaved={() => {}}
      />,
    );
    expect(screen.getByTestId("concealed-restaurant-card").dataset.goldTreatment).toBe("true");

    rerender(
      <ConcealedRestaurantCard
        restaurant={fixture(89.99)}
        position={1}
        revealed={false}
        saved={false}
        onReveal={() => {}}
        onToggleSaved={() => {}}
      />,
    );
    expect(screen.getByTestId("concealed-restaurant-card").dataset.goldTreatment).toBe("false");
  });

  it("keeps every concealed card on one bare face, whatever its position or score", () => {
    const props = {
      restaurant: fixture(88),
      revealed: false,
      saved: false,
      onReveal: () => {},
      onToggleSaved: () => {},
    };
    const { container, rerender } = render(<ConcealedRestaurantCard {...props} position={1} />);
    const face = () => screen.getByTestId("concealed-restaurant-card");

    // No pattern artwork, no positional variants: the three daily cards are
    // identical apart from the gold edge.
    const baseline = face().className;
    for (const position of [2, 3, 4]) {
      rerender(<ConcealedRestaurantCard {...props} position={position} />);
      expect(container.querySelector("svg")).toBeNull();
      expect(container.querySelector("[data-city-concealed-pattern]")).toBeNull();
      expect(face().className).toBe(baseline);
    }

    // Only the gold edge varies, and it comes from the score rather than the
    // position.
    rerender(<ConcealedRestaurantCard {...props} position={2} restaurant={fixture(90)} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(face().dataset.goldTreatment).toBe("true");
    expect(face().className).toContain("border-gold");
  });
});

describe("reveal transition", () => {
  const props = {
    restaurant: fixture(88),
    position: 1,
    saved: false,
    onReveal: () => {},
    onToggleSaved: () => {},
  };

  it("fades the noren face out over a restaurant card that is already mounted", () => {
    vi.useFakeTimers();
    const { rerender } = render(<ConcealedRestaurantCard {...props} revealed={false} />);
    rerender(<ConcealedRestaurantCard {...props} revealed />);

    // The card is not held back by the transition, so its photo request starts
    // at the moment of the tap.
    expect(screen.getByText("鮨さいとう")).toBeTruthy();

    const fade = screen.getByTestId("conceal-fade-out");
    expect(fade.getAttribute("aria-hidden")).toBe("true");
    expect(fade.className).toContain("pointer-events-none");
    expect(fade.style.animation).toContain("fiyu-fade-out");
    expect(screen.getByTestId("revealed-restaurant-card").firstElementChild).toHaveProperty(
      "style.animation",
      expect.stringContaining("fiyu-reveal-in"),
    );

    // The spent layer drops out once the fade is over; nothing else waits on it.
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByTestId("conceal-fade-out")).toBeNull();
    expect(screen.getByText("鮨さいとう")).toBeTruthy();
    vi.useRealTimers();
  });

  it("renders a card revealed before mount in its settled state", () => {
    render(<ConcealedRestaurantCard {...props} revealed />);

    expect(screen.queryByTestId("conceal-fade-out")).toBeNull();
    expect(
      screen.getByTestId("revealed-restaurant-card").firstElementChild?.getAttribute("style"),
    ).toBeNull();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("selects three low-contrast noren variants deterministically by card position", () => {
    const props = {
      restaurant: fixture(88),
      revealed: false,
      saved: false,
      onReveal: () => {},
      onToggleSaved: () => {},
    };
    const { container, rerender } = render(
      <ConcealedRestaurantCard {...props} position={1} />,
    );
    const pattern = () => container.querySelector("[data-city-concealed-pattern]");
    expect(pattern()?.getAttribute("data-city-concealed-pattern")).toBe("0");
    expect(pattern()?.getAttribute("class")).toContain("opacity-[0.16]");

    rerender(<ConcealedRestaurantCard {...props} position={2} />);
    expect(pattern()?.getAttribute("data-city-concealed-pattern")).toBe("1");
    rerender(<ConcealedRestaurantCard {...props} position={3} />);
    expect(pattern()?.getAttribute("data-city-concealed-pattern")).toBe("2");
    rerender(<ConcealedRestaurantCard {...props} position={4} />);
    expect(pattern()?.getAttribute("data-city-concealed-pattern")).toBe("0");
  });

  it("does not encode gold treatment into the noren pattern", () => {
    const shared = {
      position: 2,
      revealed: false,
      saved: false,
      onReveal: () => {},
      onToggleSaved: () => {},
    };
    const { container, rerender } = render(
      <ConcealedRestaurantCard {...shared} restaurant={fixture(90)} />,
    );
    const patternIndex = () =>
      container
        .querySelector("[data-city-concealed-pattern]")
        ?.getAttribute("data-city-concealed-pattern");
    expect(patternIndex()).toBe("1");
    expect(screen.getByTestId("concealed-restaurant-card").dataset.goldTreatment).toBe("true");

    rerender(<ConcealedRestaurantCard {...shared} restaurant={fixture(80)} />);
    expect(patternIndex()).toBe("1");
    expect(screen.getByTestId("concealed-restaurant-card").dataset.goldTreatment).toBe("false");
  });

});

// @vitest-environment jsdom
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConcealedRestaurantCard, PICK_FLIP_MS } from "./ConcealedRestaurantCard";
import { publicRestaurantSchema } from "@/lib/api/schemas";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const restaurant = (score: number | null) => publicRestaurantSchema.parse({
  place_id: "pick", name_ja: "鮨さいとう", name_en: "Sushi Saito",
  description_en: "Edomae sushi.", category: "Sushi", fiyu_score: score,
});
const props = { restaurant: restaurant(88), position: 1, saved: false,
  onReveal: vi.fn(), onToggleSaved: vi.fn(), onViewDetails: vi.fn() };
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const settle = () => act(() => vi.advanceTimersByTime(PICK_FLIP_MS));

describe("Pick flip", () => {
  it("conceals all identity and score, including the exceptional edge", () => {
    const { rerender } = render(<ConcealedRestaurantCard {...props} revealed={false} />);
    for (const score of [89, 90, 99]) {
      rerender(<ConcealedRestaurantCard {...props} restaurant={restaurant(score)} revealed={false} />);
      expect(screen.queryByText("Sushi Saito")).toBeNull();
      expect(screen.queryByLabelText(/Fiyu score/)).toBeNull();
      expect(screen.queryByTestId("compact-restaurant-card")).toBeNull();
      expect(screen.getByTestId("concealed-restaurant-card").dataset.goldTreatment).toBe("false");
    }
    const button = screen.getByRole("button", { name: "Reveal Fiyu Pick 1" });
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(props.onReveal).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("revealed-restaurant-card")).toBeNull();
  });

  it("keeps pending requests concealed and disabled", () => {
    render(<ConcealedRestaurantCard {...props} revealed={false} revealPending />);
    const button = screen.getByRole("button", { name: "Reveal Fiyu Pick 1" });
    fireEvent.click(button);
    expect(props.onReveal).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("flips only after success, blocks navigation until settled and restores keyboard focus", () => {
    const { rerender, container } = render(<ConcealedRestaurantCard {...props} revealed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Reveal Fiyu Pick 1" }));
    rerender(<ConcealedRestaurantCard {...props} revealed />);
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("flipping");
    const view = container.querySelector<HTMLButtonElement>('button[aria-label="View restaurant"]')!;
    fireEvent.click(view);
    expect(props.onViewDetails).not.toHaveBeenCalled();
    expect(view.closest("[inert]")).not.toBeNull();
    settle();
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("resting");
    expect(view.closest("[inert]")).toBeNull();
    expect(document.activeElement).toBe(view);
    fireEvent.click(view);
    expect(props.onViewDetails).toHaveBeenCalledOnce();
    expect(screen.getByText("Why Fiyu found it")).toBeTruthy();
  });

  it.each([[89, false], [89.99, false], [90, true], [95, true], [null, false]])(
    "uses the unrounded final score %s for the exceptional resting edge", (score, gold) => {
      render(<ConcealedRestaurantCard {...props} restaurant={restaurant(score as number | null)} revealed />);
      expect(screen.getByTestId("revealed-restaurant-card").dataset.goldTreatment).toBe(String(gold));
      expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("resting");
    },
  );

  it("does not replay on rerender or restored mount", () => {
    const { rerender, unmount } = render(<ConcealedRestaurantCard {...props} revealed={false} />);
    rerender(<ConcealedRestaurantCard {...props} revealed />);
    settle();
    rerender(<ConcealedRestaurantCard {...props} revealed saved />);
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("resting");
    unmount();
    render(<ConcealedRestaurantCard {...props} revealed />);
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("resting");
  });

  it("uses an immediate static front for reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"), addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }));
    const { rerender } = render(<ConcealedRestaurantCard {...props} restaurant={restaurant(90)} revealed={false} />);
    rerender(<ConcealedRestaurantCard {...props} restaurant={restaurant(90)} revealed />);
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("resting");
    expect(screen.getByTestId("revealed-restaurant-card").dataset.goldTreatment).toBe("true");
    expect(screen.getByRole("button", { name: "View restaurant" })).toBeTruthy();
  });
});

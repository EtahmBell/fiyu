// @vitest-environment jsdom
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConcealedRestaurantCard } from "./ConcealedRestaurantCard";
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
const settle = () => act(() => vi.advanceTimersByTime(700));

describe("Pick reveal", () => {
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
    expect(button.textContent?.trim()).toBe("Fiyu");
    expect(button.textContent).not.toContain("Tap to reveal");
    expect(button.textContent).not.toContain("Pick 01");
    expect(screen.getByTestId("concealed-restaurant-card").dataset.revealVariant).toBe("regular");
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(props.onReveal).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("revealed-restaurant-card")).toBeNull();
  });

  it("sizes each Pick with a text-free replica that stays mounted after reveal", () => {
    const { rerender } = render(<ConcealedRestaurantCard {...props} revealed={false} />);
    const sizer = screen.getByTestId("compact-card-sizer");
    // Nothing identifying: no name, no score, no text at all beyond spacing.
    expect(sizer.textContent?.replace(/\s|\u00a0/g, "")).toBe("");
    expect(sizer.closest("[aria-hidden='true']")).not.toBeNull();
    expect(sizer.querySelector("a, button")).toBeNull();
    expect(screen.queryByLabelText(/Fiyu score/)).toBeNull();
    rerender(<ConcealedRestaurantCard {...props} revealed />);
    settle();
    // Still present once revealed, so the cell cannot shrink when the back unmounts.
    expect(screen.getByTestId("compact-card-sizer")).toBe(sizer);
  });

  it("keeps pending requests concealed and disabled", () => {
    render(<ConcealedRestaurantCard {...props} revealed={false} revealPending />);
    const button = screen.getByRole("button", { name: "Reveal Fiyu Pick 1" });
    fireEvent.click(button);
    expect(props.onReveal).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("presses and shines immediately, then crossfades both mounted faces after success", () => {
    const { rerender, container } = render(<ConcealedRestaurantCard {...props} revealed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Reveal Fiyu Pick 1" }));
    expect(screen.getByTestId("concealed-restaurant-card").dataset.revealMotion).toBe("pressing");
    expect(screen.getByTestId("pick-hidden-face")).toBeTruthy();
    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByTestId("concealed-restaurant-card").dataset.revealMotion).toBe("shining");
    expect(screen.getByTestId("pick-shine").getAttribute("data-reveal-active")).toBe("true");
    rerender(<ConcealedRestaurantCard {...props} revealed />);
    expect(screen.getByTestId("pick-hidden-face")).toBeTruthy();
    expect(screen.getByTestId("pick-restaurant-face")).toBeTruthy();
    act(() => vi.advanceTimersByTime(160));
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("shining");
    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("ready");
    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("revealing");
    expect(screen.getByTestId("pick-hidden-face")).toBeTruthy();
    expect(screen.getByTestId("pick-restaurant-face")).toBeTruthy();
    const view = container.querySelector<HTMLButtonElement>('button[aria-label="View restaurant"]')!;
    fireEvent.click(view);
    expect(props.onViewDetails).not.toHaveBeenCalled();
    expect(view.closest("[inert]")).not.toBeNull();
    act(() => vi.advanceTimersByTime(360));
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("revealed");
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
      expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("revealed");
    },
  );

  it("does not replay on rerender or restored mount", () => {
    const { rerender, unmount } = render(<ConcealedRestaurantCard {...props} revealed={false} />);
    rerender(<ConcealedRestaurantCard {...props} revealed />);
    settle();
    rerender(<ConcealedRestaurantCard {...props} revealed saved />);
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("revealed");
    unmount();
    render(<ConcealedRestaurantCard {...props} revealed />);
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("revealed");
  });

  it("uses the shared 150ms opacity-only path for reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"), addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }));
    const { rerender } = render(<ConcealedRestaurantCard {...props} restaurant={restaurant(90)} revealed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Reveal Fiyu Pick 1" }));
    act(() => vi.advanceTimersByTime(20));
    rerender(<ConcealedRestaurantCard {...props} restaurant={restaurant(90)} revealed />);
    act(() => vi.advanceTimersByTime(180));
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("shining");
    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("ready");
    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("revealing");
    act(() => vi.advanceTimersByTime(149));
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("revealing");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("revealed-restaurant-card").dataset.revealMotion).toBe("revealed");
    expect(screen.getByTestId("revealed-restaurant-card").dataset.goldTreatment).toBe("true");
    expect(screen.getByRole("button", { name: "View restaurant" })).toBeTruthy();
  });
});

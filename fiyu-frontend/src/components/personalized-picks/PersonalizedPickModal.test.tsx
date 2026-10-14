// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PersonalizedPickModal } from "@/components/personalized-picks/PersonalizedPickModal";
import { publicRestaurantSchema, type PersonalizedPickState } from "@/lib/api/schemas";
import restaurantFixture from "@/test/fixtures/restaurants.json";

vi.mock("@/components/restaurant/RestaurantPhoto", () => ({
  RestaurantPhoto: ({ restaurantName }: { restaurantName: string }) => (
    <div data-testid="photo">{restaurantName}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const hiddenState: PersonalizedPickState = {
  status: "event_available",
  qualifying_rating_count: 10,
  unlock_threshold: 10,
  event_eligible: false,
  event_id: "event-a",
  card_count: 3,
  created_at: "2026-10-11T00:00:00Z",
  expires_at: "2026-10-18T00:00:00Z",
  dismissed_until: null,
  dismissal_count: 0,
  selected_position: null,
  selected_at: null,
  active_until: null,
  selected_restaurant: null,
};
const selectedRestaurant = publicRestaurantSchema.parse(restaurantFixture[0]);
const selectedState: PersonalizedPickState = {
  ...hiddenState,
  status: "selected",
  card_count: null,
  selected_position: 1,
  selected_at: "2026-10-11T00:01:00Z",
  active_until: "2026-10-14T00:01:00Z",
  selected_restaurant: selectedRestaurant,
};

describe("Personalized Pick event modal", () => {
  it("renders three simplified Fiyu-only hidden cards without identities or game labels", () => {
    render(
      <PersonalizedPickModal
        state={hiddenState}
        reveal={false}
        pendingPosition={null}
        onDismiss={() => {}}
        onSelect={() => {}}
        onCloseReveal={() => {}}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Something for you" })).toBeTruthy();
    const cards = screen.getAllByRole("button", { name: /Choose hidden card/ });
    expect(cards).toHaveLength(3);
    expect(cards.every((card) => card.textContent?.includes("Fiyu"))).toBe(true);
    expect(cards.every((card) => card.textContent?.includes("Reveal"))).toBe(true);
    expect(cards.every((card) => card.dataset.pickCardRatio === "16/9")).toBe(true);
    expect(cards.every((card) => card.className.includes("cardFrame"))).toBe(true);
    expect(cards.every((card) => card.getAttribute("data-reveal-variant") === "personalized"))
      .toBe(true);
    expect(document.body.textContent).not.toContain("Tap to reveal");
    expect(document.body.textContent).not.toContain("Fiyu Pick 01");
    expect(document.body.textContent).not.toContain("Hamadayama Jojoen");
  });

  it("dismisses with Escape before selection", () => {
    const dismiss = vi.fn();
    render(
      <PersonalizedPickModal
        state={hiddenState}
        reveal={false}
        pendingPosition={null}
        onDismiss={dismiss}
        onSelect={() => {}}
        onCloseReveal={() => {}}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("locks selection immediately and sends only one keyboard-selected stable slot", () => {
    const dismiss = vi.fn();
    const select = vi.fn();
    render(
      <PersonalizedPickModal
        state={hiddenState}
        reveal={false}
        pendingPosition={null}
        onDismiss={dismiss}
        onSelect={select}
        onCloseReveal={() => {}}
      />,
    );

    const chosen = screen.getByRole("button", { name: "Choose hidden card 2" });
    fireEvent.click(chosen, { detail: 0 });
    fireEvent.click(chosen, { detail: 0 });

    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith(1);
    expect(chosen.getAttribute("data-choice-state")).toBe("selected");
    expect(screen.getAllByRole("button", { name: /Choose hidden card/ })
      .every((card) => (card as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole("button", { name: "Choose hidden card 1" })
      .getAttribute("data-choice-state")).toBe("withheld");

    fireEvent.click(screen.getByTestId("personalized-pick-backdrop"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("paints explicit phases and keeps both faces mounted through the crossfade", () => {
    vi.useFakeTimers();
    const select = vi.fn();
    const { rerender } = render(
      <PersonalizedPickModal
        state={hiddenState}
        reveal={false}
        pendingPosition={null}
        onDismiss={() => {}}
        onSelect={select}
        onCloseReveal={() => {}}
      />,
    );
    const stage = screen.getByTestId("personalized-pick-reveal-stage");

    fireEvent.click(screen.getByRole("button", { name: "Choose hidden card 2" }));
    expect(stage.getAttribute("data-pp-phase")).toBe("pressing");
    expect(select).toHaveBeenCalledOnce();

    act(() => vi.advanceTimersByTime(20));
    expect(stage.getAttribute("data-pp-phase")).toBe("shining");
    expect(screen.getByTestId("personalized-pick-shine").getAttribute("data-reveal-active"))
      .toBe("true");

    rerender(
      <PersonalizedPickModal
        state={selectedState}
        reveal
        pendingPosition={null}
        onDismiss={() => {}}
        onSelect={select}
        onCloseReveal={() => {}}
      />,
    );
    expect(stage.getAttribute("data-pp-phase")).toBe("shining");
    expect(screen.getByTestId("personalized-pick-hidden-face")).toBeTruthy();
    expect(screen.getByTestId("personalized-pick-restaurant-face")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "浜田山叙々苑" })).toBeNull();

    act(() => vi.advanceTimersByTime(160));
    expect(stage.getAttribute("data-pp-phase")).toBe("shining");
    act(() => vi.advanceTimersByTime(20));
    expect(stage.getAttribute("data-pp-phase")).toBe("ready");
    act(() => vi.advanceTimersByTime(40));
    expect(stage.getAttribute("data-pp-phase")).toBe("revealing");
    expect(screen.getByTestId("personalized-pick-hidden-face")).toBeTruthy();
    expect(screen.getByTestId("personalized-pick-restaurant-face")).toBeTruthy();

    act(() => vi.advanceTimersByTime(360));
    expect(stage.getAttribute("data-pp-phase")).toBe("revealed");
    expect(screen.getByRole("heading", { name: "浜田山叙々苑" })).toBeTruthy();
  });

  it("dismisses from the backdrop without selecting a card", () => {
    const dismiss = vi.fn();
    const select = vi.fn();
    render(
      <PersonalizedPickModal
        state={hiddenState}
        reveal={false}
        pendingPosition={null}
        onDismiss={dismiss}
        onSelect={select}
        onCloseReveal={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId("personalized-pick-backdrop"));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
  });

  it("does not dismiss when interacting inside the dialog", () => {
    const dismiss = vi.fn();
    render(
      <PersonalizedPickModal
        state={hiddenState}
        reveal={false}
        pendingPosition={null}
        onDismiss={dismiss}
        onSelect={() => {}}
        onCloseReveal={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("dialog", { name: "Something for you" }));
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("traps keyboard focus inside the modal", () => {
    render(
      <PersonalizedPickModal
        state={hiddenState}
        reveal={false}
        pendingPosition={null}
        onDismiss={() => {}}
        onSelect={() => {}}
        onCloseReveal={() => {}}
      />,
    );
    const first = screen.getByRole("button", { name: "Close for now" });
    const last = screen.getByRole("button", { name: "Not now" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("reveals and announces only the server-selected restaurant", () => {
    render(
      <PersonalizedPickModal
        state={selectedState}
        reveal
        pendingPosition={null}
        onDismiss={() => {}}
        onSelect={() => {}}
        onCloseReveal={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: "浜田山叙々苑" })).toBeTruthy();
    expect(screen.getByText("Picked for you")).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: /Choose hidden card/ })).toHaveLength(0);
  });

  it("uses the separate 150ms reduced-motion crossfade without shine motion", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { rerender } = render(
      <PersonalizedPickModal
        state={hiddenState}
        reveal={false}
        pendingPosition={null}
        onDismiss={() => {}}
        onSelect={() => {}}
        onCloseReveal={() => {}}
      />,
    );

    const stage = screen.getByTestId("personalized-pick-reveal-stage");
    expect(stage.getAttribute("data-reduced-motion")).toBe("true");
    const chosen = screen.getByRole("button", { name: "Choose hidden card 1" });
    expect(chosen.getAttribute("data-selection-motion")).toBe("reduced");
    fireEvent.click(chosen);
    expect(stage.getAttribute("data-pp-phase")).toBe("pressing");

    act(() => vi.advanceTimersByTime(20));
    rerender(
      <PersonalizedPickModal
        state={selectedState}
        reveal
        pendingPosition={null}
        onDismiss={() => {}}
        onSelect={() => {}}
        onCloseReveal={() => {}}
      />,
    );
    act(() => vi.advanceTimersByTime(180));
    expect(stage.getAttribute("data-pp-phase")).toBe("shining");
    act(() => vi.advanceTimersByTime(20));
    expect(stage.getAttribute("data-pp-phase")).toBe("ready");
    act(() => vi.advanceTimersByTime(40));
    expect(stage.getAttribute("data-pp-phase")).toBe("revealing");
    expect(screen.getByTestId("personalized-pick-hidden-face")).toBeTruthy();
    expect(screen.getByTestId("personalized-pick-restaurant-face")).toBeTruthy();
    act(() => vi.advanceTimersByTime(149));
    expect(stage.getAttribute("data-pp-phase")).toBe("revealing");
    act(() => vi.advanceTimersByTime(1));
    expect(stage.getAttribute("data-pp-phase")).toBe("revealed");
  });
});

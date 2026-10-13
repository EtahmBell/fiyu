// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    expect(cards.map((card) => card.textContent?.trim())).toEqual(["Fiyu", "Fiyu", "Fiyu"]);
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
    const restaurant = publicRestaurantSchema.parse(restaurantFixture[0]);
    render(
      <PersonalizedPickModal
        state={{
          ...hiddenState,
          status: "selected",
          card_count: null,
          selected_position: 2,
          selected_at: "2026-10-11T00:01:00Z",
          active_until: "2026-10-14T00:01:00Z",
          selected_restaurant: restaurant,
        }}
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

  it("uses a static reduced-motion crossfade without shine motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const restaurant = publicRestaurantSchema.parse(restaurantFixture[0]);
    render(
      <PersonalizedPickModal
        state={{
          ...hiddenState,
          status: "selected",
          card_count: null,
          selected_position: 0,
          selected_at: "2026-10-11T00:01:00Z",
          active_until: "2026-10-14T00:01:00Z",
          selected_restaurant: restaurant,
        }}
        reveal
        pendingPosition={null}
        onDismiss={() => {}}
        onSelect={() => {}}
        onCloseReveal={() => {}}
      />,
    );

    expect(screen.getByRole("heading", { name: "浜田山叙々苑" })
      .closest("[data-reveal-motion]")?.getAttribute("data-reveal-motion"))
      .toBe("reduced-crossfade");
  });
});

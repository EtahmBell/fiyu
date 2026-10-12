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

afterEach(cleanup);

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
  it("renders exactly three keyboard-accessible hidden cards without identities", () => {
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
    expect(screen.getAllByRole("button", { name: /Choose hidden card/ })).toHaveLength(3);
    expect(document.body.textContent).not.toContain("Hamadayama Jojoen");
  });

  it("dismisses with Escape and sends only the selected stable slot", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Choose hidden card 2" }));
    expect(select).toHaveBeenCalledWith(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dismiss).toHaveBeenCalledTimes(1);
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
});

// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { RecentDiscoveries } from "@/components/daily-picks/RecentDiscoveries";
import { publicRestaurantSchema } from "@/lib/api/schemas";
vi.mock("@/components/personalized-picks/PersonalizedPickProvider", () => ({
  usePersonalizedPick: () => ({
    state: {
      status: "selected",
      active_until: "2099-10-14T00:00:00Z",
      selected_restaurant: {
        place_id: "personalized-a",
        name_ja: "特別な店",
        name_en: "A Special Place",
        category: "Sushi",
        display_area: "Kichijoji",
        description_en: "A calm neighborhood counter.",
        card_description: "A calm neighborhood counter.",
        fiyu_score: 84,
        food_tags: [],
        signature_dishes: [],
        budget: null,
      },
    },
  }),
}));
vi.mock("@/components/restaurant/RestaurantPhoto", () => ({
  RestaurantPhoto: () => <div data-testid="photo" />,
}));

afterEach(cleanup);

it("keeps the active Personalized Pick in Recent Discoveries with its semantic treatment", () => {
  const { container } = render(
    <RecentDiscoveries
      discoveries={[]}
      restaurants={[]}
      savedRestaurantIds={[]}
      now={Date.now()}
      selectedPlaceId="personalized-a"
      onToggleSaved={() => {}}
    />,
  );
  expect(screen.getByText("Picked for you")).toBeTruthy();
  expect(container.querySelector('[data-tone="personalized"]')).toBeTruthy();
  expect(container.querySelector("section")?.className).toContain("border-discovery-line");
  expect(container.querySelector('[data-tone="personalized"]')?.parentElement?.className)
    .toContain("--color-personalized");
  expect(screen.queryByText("No recent discoveries")).toBeNull();
});

it("renders a saved Recent Discovery as a clear purple glyph without a resting box", () => {
  const now = Date.UTC(2026, 9, 12, 12);
  const restaurant = publicRestaurantSchema.parse({
    place_id: "history-a",
    name_ja: "保存した店",
    name_en: "Saved Discovery",
    category: "Izakaya",
    display_area: "Koenji",
    description_en: "A neighborhood counter.",
    card_description: "A neighborhood counter.",
    fiyu_score: 82,
    food_tags: [],
    signature_dishes: [],
    budget: null,
  });
  render(
    <RecentDiscoveries
      discoveries={[{ restaurantId: restaurant.place_id, revealedAt: new Date(now).toISOString() }]}
      restaurants={[restaurant]}
      savedRestaurantIds={[restaurant.place_id]}
      now={now}
      onToggleSaved={() => {}}
    />,
  );

  const saved = screen.getByRole("button", { name: "Remove restaurant from saved" });
  expect(saved.className).toContain("text-lavender-700");
  expect(saved.className.split(/\s+/)).not.toContain("bg-lavender-100/70");
  expect(saved.className.split(/\s+/).some((token) => token.startsWith("opacity-"))).toBe(false);
  expect(saved.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
});

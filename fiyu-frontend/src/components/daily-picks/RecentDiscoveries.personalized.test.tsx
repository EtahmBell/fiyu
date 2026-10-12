// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { RecentDiscoveries } from "@/components/daily-picks/RecentDiscoveries";
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
      onToggleSaved={() => {}}
    />,
  );
  expect(screen.getByText("Picked for you")).toBeTruthy();
  expect(container.querySelector('[data-tone="personalized"]')).toBeTruthy();
  expect(screen.queryByText("No recent discoveries")).toBeNull();
});

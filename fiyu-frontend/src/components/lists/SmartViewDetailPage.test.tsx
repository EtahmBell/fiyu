// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SmartViewDetailPage } from "@/components/lists/SmartViewDetailPage";

const smartApi = vi.hoisted(() => ({
  fetchDefaultListSmartView: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  fetchDefaultListSmartView: smartApi.fetchDefaultListSmartView,
}));

vi.mock("@/components/restaurant/RestaurantPhoto", () => ({
  RestaurantPhoto: ({ restaurantName }: { restaurantName: string }) => (
    <div data-testid="mock-photo">{restaurantName}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  smartApi.fetchDefaultListSmartView.mockReset();
});

describe("SmartViewDetailPage", () => {
  it("renders the selected Smart View with Back to Smart link", async () => {
    smartApi.fetchDefaultListSmartView.mockResolvedValue({
      city_id: "tokyo",
      view_key: "recently_saved",
      label: "Recently saved",
      description: "Most recently saved restaurants first.",
      item_count: 1,
      items: [
        {
          place_id: "one",
          added_at: "2026-08-03T00:00:00Z",
          is_visited: false,
          distance_km: null,
          restaurant: {
            place_id: "one",
            name_ja: "店一",
            name_en: "Shop One",
            primary_category: "sushi",
            neighborhood: "Asakusa",
            fiyu_score: 90,
            score_band: "excellent",
          },
        },
      ],
      groups: [],
      generated_at: "now",
    });

    render(<SmartViewDetailPage viewKey="recently_saved" />);

    expect(await screen.findByRole("heading", { name: "Recently saved" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Smart" }).getAttribute("href")).toBe(
      "/lists?tab=smart",
    );
    expect(screen.getByText("1 place")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "店一" })).toBeTruthy();
  });

  it("preserves backend neighborhood group labels and counts", async () => {
    smartApi.fetchDefaultListSmartView.mockResolvedValue({
      city_id: "tokyo",
      view_key: "by_neighborhood",
      label: "By neighborhood",
      description: "Saved restaurants grouped by neighborhood.",
      item_count: 2,
      items: [],
      groups: [
        {
          group_key: "asakusa",
          title: "Asakusa",
          item_count: 1,
          items: [
            {
              place_id: "one",
              added_at: "2026-08-03T00:00:00Z",
              is_visited: false,
              distance_km: null,
              restaurant: {
                place_id: "one",
                name_ja: "店一",
                name_en: "Shop One",
                primary_category: "sushi",
                neighborhood: "Asakusa",
                fiyu_score: 90,
                score_band: "excellent",
              },
            },
          ],
        },
        {
          group_key: "ueno",
          title: "Ueno",
          item_count: 1,
          items: [
            {
              place_id: "two",
              added_at: "2026-08-03T00:00:00Z",
              is_visited: false,
              distance_km: null,
              restaurant: {
                place_id: "two",
                name_ja: "店二",
                name_en: "Shop Two",
                primary_category: "ramen",
                neighborhood: "Ueno",
                fiyu_score: 80,
                score_band: "strong",
              },
            },
          ],
        },
      ],
      generated_at: "now",
    });

    render(<SmartViewDetailPage viewKey="by_neighborhood" />);

    expect(await screen.findByRole("heading", { name: "By neighbourhood" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Asakusa" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ueno" })).toBeTruthy();
    expect(screen.getAllByText("1 place")).toHaveLength(2);
  });
});

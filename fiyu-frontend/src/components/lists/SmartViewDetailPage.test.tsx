// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SmartViewDetailPage } from "@/components/lists/SmartViewDetailPage";
import { FiyuApiError } from "@/lib/api/errors";

const smartApi = vi.hoisted(() => ({
  fetchRestaurants: vi.fn(),
  fetchDefaultListSmartViews: vi.fn(),
  fetchDefaultListSmartView: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  fetchRestaurants: smartApi.fetchRestaurants,
  fetchDefaultListSmartViews: smartApi.fetchDefaultListSmartViews,
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
  smartApi.fetchRestaurants.mockReset();
  smartApi.fetchDefaultListSmartViews.mockReset();
  smartApi.fetchDefaultListSmartView.mockReset();
  smartApi.fetchRestaurants.mockResolvedValue({ restaurants: [], rejected: [] });
  smartApi.fetchDefaultListSmartViews.mockResolvedValue({
    city_id: "tokyo",
    generated_at: "now",
    views: [
      { key: "recently_saved", label: "Recently saved", description: "Most recently saved restaurants first.", tier: "free", locked: false, available: true, item_count: 1 },
      { key: "by_neighborhood", label: "By neighborhood", description: "Saved restaurants grouped by neighborhood.", tier: "free", locked: false, available: true, item_count: 2 },
      { key: "ramen_in_shibuya", label: "Ramen in Shibuya", description: "Saved ramen spots in Shibuya.", tier: "premium", locked: false, available: true, item_count: 0 },
      { key: "worth_the_detour", label: "Worth the detour", description: "Saved restaurants with standout Fiyu scores.", tier: "premium", locked: false, available: true, item_count: 1 },
    ],
  });
});

describe("SmartViewDetailPage", () => {
  it("renders the selected Smart View with Back to Smart Lists link", async () => {
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
    expect(screen.getByRole("link", { name: "Back to Smart Lists" }).getAttribute("href")).toBe(
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

  it("reuses the same detail route for an unlocked Premium collection", async () => {
    smartApi.fetchDefaultListSmartView.mockResolvedValueOnce({
      city_id: "tokyo",
      view_key: "worth_the_detour",
      label: "Worth the detour",
      description: "Saved restaurants with standout Fiyu scores.",
      tier: "premium",
      locked: false,
      available: true,
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

    render(<SmartViewDetailPage viewKey="worth_the_detour" />);

    expect(await screen.findByRole("heading", { name: "Worth the detour" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Smart Lists" }).getAttribute("href")).toBe(
      "/lists?tab=smart",
    );
    expect(screen.getByRole("heading", { level: 2, name: "店一" })).toBeTruthy();
    expect(smartApi.fetchDefaultListSmartView).toHaveBeenCalledOnce();
  });

  it("does not fetch Premium collection contents when the catalog marks it locked", async () => {
    smartApi.fetchDefaultListSmartViews.mockResolvedValueOnce({
      city_id: "tokyo",
      generated_at: "now",
      views: [
        {
          key: "worth_the_detour",
          label: "Worth the detour",
          description: "Saved restaurants with standout Fiyu scores.",
          tier: "premium",
          locked: true,
          available: true,
          item_count: null,
          required_capability: "premium_smart_views",
        },
      ],
    });

    render(<SmartViewDetailPage viewKey="worth_the_detour" />);

    expect(await screen.findByRole("heading", { name: "Premium collection" })).toBeTruthy();
    expect(screen.getByText(/Fiyu Premium turns your saved restaurants/i)).toBeTruthy();
    expect(smartApi.fetchDefaultListSmartView).not.toHaveBeenCalled();
    expect(smartApi.fetchRestaurants).not.toHaveBeenCalled();
  });

  it("handles premium entitlement errors with a clean message", async () => {
    smartApi.fetchDefaultListSmartView.mockRejectedValueOnce(
      new FiyuApiError({
        kind: "unknown",
        endpoint: "/lists/default/smart-views/worth_the_detour",
        status: 403,
        detail: "Capability 'premium_smart_views' requires premium access",
      }),
    );

    render(<SmartViewDetailPage viewKey="worth_the_detour" />);

    expect(await screen.findByText("This Premium collection is unavailable for this account.")).toBeTruthy();
  });

  it("shows unavailable collections distinctly from empty collections", async () => {
    smartApi.fetchDefaultListSmartViews.mockResolvedValueOnce({
      city_id: "tokyo",
      generated_at: "now",
      views: [
        {
          key: "ramen_in_shibuya",
          label: "Ramen in Shibuya",
          description: "Saved ramen spots in Shibuya.",
          tier: "premium",
          locked: false,
          available: false,
          unavailable_reason: "Set a discovery origin to use this collection.",
          item_count: null,
        },
      ],
    });

    render(<SmartViewDetailPage viewKey="ramen_in_shibuya" />);

    expect(await screen.findByText("This collection is unavailable")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Set discovery origin" }).getAttribute("href")).toBe(
      "/picks",
    );
    expect(screen.queryByRole("heading", { name: "No places yet" })).toBeNull();
    expect(smartApi.fetchDefaultListSmartView).not.toHaveBeenCalled();
  });
});

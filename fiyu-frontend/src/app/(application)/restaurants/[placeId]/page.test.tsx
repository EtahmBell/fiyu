import { describe, expect, it, vi } from "vitest";

import RestaurantDetailPage from "@/app/(application)/restaurants/[placeId]/page";
import { publicRestaurantDetailSchema } from "@/lib/api/schemas";

const api = vi.hoisted(() => ({ fetchRestaurant: vi.fn(), fetchRestaurants: vi.fn() }));
vi.mock("@/lib/api/client", () => api);
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

describe("restaurant detail route", () => {
  it("loads a directly addressed place_id through the reusable template", async () => {
    const restaurant = publicRestaurantDetailSchema.parse({
      place_id: "direct-place",
      name_ja: "浜田家",
      name_en: "Hamadaya",
    });
    api.fetchRestaurant.mockResolvedValueOnce(restaurant);
    api.fetchRestaurants.mockResolvedValueOnce({ restaurants: [restaurant], rejected: [] });

    const page = await RestaurantDetailPage({ params: Promise.resolve({ placeId: "direct-place" }) });

    expect(api.fetchRestaurant).toHaveBeenCalledWith("direct-place");
    expect(page.props.restaurant.place_id).toBe("direct-place");
    expect(page.props.restaurants).toHaveLength(1);
    expect(page.props.initialScoreBreakdownOpen).toBe(false);
  });

  it("initializes the score breakdown only for the dedicated Why URL intent", async () => {
    const restaurant = publicRestaurantDetailSchema.parse({
      place_id: "why-place",
      name_en: "Why Place",
    });
    api.fetchRestaurant.mockResolvedValueOnce(restaurant);
    api.fetchRestaurants.mockResolvedValueOnce({ restaurants: [restaurant], rejected: [] });

    const page = await RestaurantDetailPage({
      params: Promise.resolve({ placeId: "why-place" }),
      searchParams: Promise.resolve({ "score-breakdown": "open" }),
    });

    expect(page.props.initialScoreBreakdownOpen).toBe(true);
  });
});

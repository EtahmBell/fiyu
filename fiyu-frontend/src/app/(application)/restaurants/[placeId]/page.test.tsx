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
  });
});

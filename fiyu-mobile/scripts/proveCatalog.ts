import { joinApiUrl, parseRestaurantList, restaurantsPath } from "@fiyu/contracts";

async function main(): Promise<void> {
  const baseUrl = (process.env.EXPO_PUBLIC_FIYU_API_URL?.trim() || "https://api.fiyuapp.com").replace(/\/+$/, "");
  const endpoint = restaurantsPath(3);
  const response = await fetch(joinApiUrl(baseUrl, endpoint), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Catalog proof failed with HTTP ${response.status}`);
  const parsed = parseRestaurantList(await response.json());
  if (!parsed || parsed.restaurants.length === 0) throw new Error("Catalog proof returned no valid restaurants");
  const first = parsed.restaurants[0];
  console.log(JSON.stringify({
    endpoint,
    validRestaurants: parsed.restaurants.length,
    rejectedRestaurants: parsed.rejected.length,
    firstRestaurant: { placeId: first.place_id, name: first.name_ja ?? first.name_en },
  }, null, 2));
}

void main();

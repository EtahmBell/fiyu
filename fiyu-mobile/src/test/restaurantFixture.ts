import { publicRestaurantSchema } from "@fiyu/contracts";

export const restaurantFixture = publicRestaurantSchema.parse({
  place_id: "ChIJnativeproof",
  name_ja: "フィーユ食堂",
  name_en: "Fiyu Shokudo",
  category: "Japanese",
  display_area: "Koenji",
  fiyu_score: 84,
  description_en: "A real-shaped contract fixture for native presentation tests.",
});

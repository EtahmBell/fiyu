import { describe, expect, it } from "vitest";

import { publicRestaurantSchema } from "@/lib/api/schemas";
import { compactDescription } from "@/lib/daily-picks/cardContent";

describe("compactDescription", () => {
  it("uses two suitable existing English sentences and omits later copy", () => {
    const restaurant = publicRestaurantSchema.parse({
      place_id: "existing-copy",
      description_en:
        "A counter restaurant focused on seasonal sushi. Reservations are required for its set menu. A third sentence should not reach the compact card.",
    });

    expect(compactDescription(restaurant)).toBe(
      "A counter restaurant focused on seasonal sushi. Reservations are required for its set menu.",
    );
  });

  it("does not synthesize location or provenance filler when useful copy is absent", () => {
    const restaurant = publicRestaurantSchema.parse({
      place_id: "fallback",
      name_en: "Edo Sakaba Umi",
      description_en: "\u65e5\u672c\u8a9e\u306e\u8aac\u660e\u3067\u3059\u3002",
      category: "Izakaya / standing bar",
      neighborhood: "Jingumae",
      signature_dishes: ["Grilled chicken", "Seasonal sashimi"],
      food_tags: ["sake", "counter seats"],
    });

    expect(compactDescription(restaurant)).toBeNull();
  });

  it("prefers the enriched card description over older general copy", () => {
    const restaurant = publicRestaurantSchema.parse({
      place_id: "enriched",
      card_description: "A compact izakaya focused on charcoal cooking and sake.",
      description_en: "This restaurant is in a discovery area.",
    });

    expect(compactDescription(restaurant)).toBe(
      "A compact izakaya focused on charcoal cooking and sake.",
    );
  });
});

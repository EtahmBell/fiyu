import { describe, expect, it } from "vitest";

import { publicRestaurantSchema } from "@/lib/api/schemas";
import {
  canonicalCardDescription,
  compactDescription,
} from "@/lib/daily-picks/cardContent";

describe("compactDescription", () => {
  it("preserves the complete selected description without sentence truncation", () => {
    const restaurant = publicRestaurantSchema.parse({
      place_id: "existing-copy",
      description_en:
        "A counter restaurant focused on seasonal sushi. Reservations are required for its set menu. A third sentence should not reach the compact card.",
    });

    expect(compactDescription(restaurant)).toBe(restaurant.description_en);
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

  it("falls back from mechanically incomplete card copy to the complete description", () => {
    const restaurant = publicRestaurantSchema.parse({
      place_id: "ChIJe1D1MyeLGGARBHKRN0-hQUw",
      card_description:
        "A compact wine bar in Hamamatsucho centered on wine and original spring rolls, including four distinct spring-roll varieties described by visitors as more creative than.",
      description_en:
        "A compact wine bar in Hamamatsucho centered on wine and original spring rolls, including four distinct spring-roll varieties described by visitors as more creative than conventional Chinese spring rolls.",
    });

    expect(canonicalCardDescription(restaurant)).toBe(restaurant.description_en);
    expect(compactDescription(restaurant)).toBe(restaurant.description_en);
  });

  it("does not add punctuation to source copy", () => {
    const restaurant = publicRestaurantSchema.parse({
      place_id: "verbatim",
      description_en: "A concise description without final punctuation",
    });

    expect(compactDescription(restaurant)).toBe(
      "A concise description without final punctuation",
    );
  });
});

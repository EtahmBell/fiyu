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

  it("builds a natural two-sentence English fallback from supported fields", () => {
    const restaurant = publicRestaurantSchema.parse({
      place_id: "fallback",
      name_en: "Edo Sakaba Umi",
      description_en: "æ—¥æœ¬èªžã®èª¬æ˜Žã§ã™ã€‚",
      category: "Izakaya / standing bar",
      neighborhood: "Jingumae",
      signature_dishes: ["Grilled chicken", "Seasonal sashimi"],
      food_tags: ["sake", "counter seats"],
    });

    const copy = compactDescription(restaurant) ?? "";
    expect(copy).toMatch(/^Edo Sakaba Umi is an izakaya and standing bar in Jingumae\./);
    expect(copy).toContain("Grilled chicken and Seasonal sashimi");
    expect(copy).toContain("sake and counter seats");
    expect(copy.split(/(?<=[.!?])\s+/u)).toHaveLength(2);
    expect(copy).not.toMatch(/popular|local favorite|atmosphere|award|why_fiyu/i);
  });

  it("uses the correct English indefinite article", () => {
    const restaurant = publicRestaurantSchema.parse({
      place_id: "article",
      name_en: "Izakaya Example",
      category: "Izakaya",
      discovery_area: "Ueno",
    });

    expect(compactDescription(restaurant)).toMatch(/^Izakaya Example is an izakaya/);
  });
});

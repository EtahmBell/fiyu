import { publicRestaurantDetailSchema, publicRestaurantSchema } from "@fiyu/contracts";

export const restaurantFixture = publicRestaurantSchema.parse({
  place_id: "ChIJnativeproof",
  name_ja: "フィーユ食堂",
  name_en: "Fiyu Shokudo",
  category: "Japanese",
  display_area: "Koenji",
  fiyu_score: 84,
  description_en: "A real-shaped contract fixture for native presentation tests.",
});

export const restaurantDetailFixture = publicRestaurantDetailSchema.parse({
  ...restaurantFixture,
  card_description: "A compact editorial introduction grounded in Fiyu research.",
  food_tags: ["yakitori", "counter seating"],
  restaurant_type_en: "Small independent restaurant",
  cuisine_terms_en: ["Japanese", "Yakitori"],
  signature_dishes_en: ["Charcoal-grilled chicken skewers"],
  review_themes: [{ theme: "A relaxed counter with careful charcoal cooking." }],
  budget: { currency: "JPY", minimum: 2000, maximum: 3000, band: "moderate", source_type: "researched_source", confidence: 0.9 },
  practical_info: { seating: { counter: true }, visit_style: { solo_friendly: true }, payment: { cash_only: true } },
  reservation_status: "recommended",
  opening_hours: { monday: { status: "open", periods: [{ open: "18:00", close: "23:00" }] }, schedule_note: "Hours can change on holidays." },
  verified_core_address: "1-2-3 Koenji, Suginami-ku, Tokyo",
  map_display_eligible: true,
  directions_coordinates_eligible: true,
  latitude: 35.705,
  longitude: 139.65,
  score_transparency: {
    reasons: ["Fiyu found strong specialist signals and durable local evidence."],
    model_label: "Quality-v4",
    evidence_confidence: "high",
    signals: [{ key: "specialist", label: "Specialist focus", value: 8.8, description: "A focused menu with repeated specialist evidence." }],
  },
  supporting_source_urls: [],
  researched_at: "2026-10-25T00:00:00Z",
});

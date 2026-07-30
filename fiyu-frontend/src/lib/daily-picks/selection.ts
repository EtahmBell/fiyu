import type { PublicRestaurant } from "@/lib/api/schemas";

export const JAPANESE_FOOD_PREFERENCES = [
  { id: "sushi", label: "Sushi", terms: ["sushi", "寿司", "鮨", "江戸前"] },
  { id: "izakaya", label: "Izakaya", terms: ["izakaya", "居酒屋", "立ち飲み", "日本酒"] },
  { id: "noodles", label: "Noodles", terms: ["ramen", "soba", "udon", "ラーメン", "そば", "蕎麦", "うどん", "沖縄そば"] },
  { id: "yakiniku", label: "Yakiniku", terms: ["yakiniku", "焼肉", "和牛", "牛たん", "牛タン"] },
  { id: "yakitori", label: "Yakitori", terms: ["yakitori", "焼き鳥", "焼鳥", "鳥料理", "鳥割烹"] },
  { id: "tempura", label: "Tempura", terms: ["tempura", "天ぷら", "天麩羅"] },
] as const;

export type JapaneseFoodPreference = (typeof JAPANESE_FOOD_PREFERENCES)[number]["id"];
export type NonJapanesePreference = "yes" | "occasionally" | "japanese-only";

export interface DailyPreferences {
  categories: JapaneseFoodPreference[];
  nonJapanese: NonJapanesePreference;
}

export const DEFAULT_DAILY_PREFERENCES: DailyPreferences = {
  categories: [],
  nonJapanese: "occasionally",
};

export interface DailySelectionOptions {
  activeArea?: string | null;
  /** Stable generation seed, normally the 24-hour bucket for the button click. */
  seed: number;
}

function searchableFoodText(restaurant: PublicRestaurant): string {
  return [restaurant.category, ...restaurant.food_tags]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase("en");
}

export function japaneseFoodCategory(
  restaurant: PublicRestaurant,
): JapaneseFoodPreference | "japanese-other" | "non-japanese" {
  const text = searchableFoodText(restaurant);
  for (const preference of JAPANESE_FOOD_PREFERENCES) {
    if (preference.terms.some((term) => text.includes(term.toLocaleLowerCase("en")))) {
      return preference.id;
    }
  }
  if (
    /japanese|日本料理|和食|おばんざい|懐石|割烹|丼|定食|しゃぶしゃぶ|すき焼き|お好み焼き/.test(
      text,
    )
  ) {
    return "japanese-other";
  }
  return "non-japanese";
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isInArea(restaurant: PublicRestaurant, activeArea: string | null | undefined): boolean {
  if (!activeArea) return false;
  const expected = activeArea.trim().toLocaleLowerCase("en");
  if (restaurant.discovery_area?.trim().toLocaleLowerCase("en") === expected) return true;
  return restaurant.discovery_areas.some((area) => {
    const value = area.area;
    return typeof value === "string" && value.trim().toLocaleLowerCase("en") === expected;
  });
}

/**
 * Deterministic editorial selection. The backend score remains untouched and
 * is used only in broad five-point bands; area, stated preferences, and cuisine
 * variety decide within those bands. No payment or user tier enters the rules.
 */
export function selectDailyRestaurants(
  restaurants: readonly PublicRestaurant[],
  preferences: DailyPreferences,
  { activeArea = null, seed }: DailySelectionOptions,
): PublicRestaurant[] {
  const seen = new Set<string>();
  const selectedCategories = new Set(preferences.categories);
  const candidates = restaurants
    .filter((restaurant) => {
      if (seen.has(restaurant.place_id)) return false;
      seen.add(restaurant.place_id);
      const category = japaneseFoodCategory(restaurant);
      return preferences.nonJapanese !== "japanese-only" || category !== "non-japanese";
    })
    .map((restaurant) => {
      const category = japaneseFoodCategory(restaurant);
      const preferenceRank =
        selectedCategories.size === 0 ||
        (category !== "japanese-other" &&
          category !== "non-japanese" &&
          selectedCategories.has(category))
          ? 0
          : category === "non-japanese"
            ? 2
            : 1;
      return {
        restaurant,
        category,
        preferenceRank,
        areaRank: isInArea(restaurant, activeArea) ? 0 : 1,
        scoreBand: Math.floor((restaurant.fiyu_score ?? -1) / 5),
        rotation: stableHash(`${seed}:${restaurant.place_id}`),
      };
    })
    .sort((left, right) => {
      if (left.preferenceRank !== right.preferenceRank) {
        return left.preferenceRank - right.preferenceRank;
      }
      if (left.areaRank !== right.areaRank) return left.areaRank - right.areaRank;
      if (left.scoreBand !== right.scoreBand) return right.scoreBand - left.scoreBand;
      if (left.rotation !== right.rotation) return left.rotation - right.rotation;
      return left.restaurant.place_id.localeCompare(right.restaurant.place_id);
    });

  const result: typeof candidates = [];
  const usedCategories = new Set<string>();
  const nonJapaneseLimit = preferences.nonJapanese === "occasionally" ? 1 : 3;
  const mayAdd = (candidate: (typeof candidates)[number]) =>
    candidate.category !== "non-japanese" ||
    result.filter((entry) => entry.category === "non-japanese").length < nonJapaneseLimit;

  for (const candidate of candidates) {
    if (result.length === 3) break;
    if (usedCategories.has(candidate.category) || !mayAdd(candidate)) continue;
    result.push(candidate);
    usedCategories.add(candidate.category);
  }
  for (const candidate of candidates) {
    if (result.length === 3) break;
    if (result.includes(candidate) || !mayAdd(candidate)) continue;
    result.push(candidate);
  }

  return result.length === 3 ? result.map((entry) => entry.restaurant) : [];
}

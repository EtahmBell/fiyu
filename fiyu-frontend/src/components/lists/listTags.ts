import type { PublicRestaurant } from "@/lib/api/schemas";
import { englishCardTags } from "@/lib/daily-picks/cardContent";

export type ListTagLookup = Map<string, string[]>;

export function buildListTagLookup(restaurants: PublicRestaurant[]): ListTagLookup {
  const lookup = new Map<string, string[]>();
  for (const restaurant of restaurants) {
    const tags = englishCardTags(restaurant);
    if (tags.length > 0) lookup.set(restaurant.place_id, tags);
  }
  return lookup;
}

export function resolveListTags(
  lookup: ListTagLookup,
  placeId: string,
  fallbackCategory: string | null | undefined,
): string[] {
  const fromLookup = lookup.get(placeId);
  if (fromLookup && fromLookup.length > 0) return fromLookup;
  const category = fallbackCategory?.trim();
  return category ? [category] : [];
}

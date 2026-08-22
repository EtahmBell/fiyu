import type { PublicRestaurant } from "@/lib/api/schemas";

const JAPANESE_TEXT = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9f]/u;
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/u;

export function englishStructuredValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && !JAPANESE_TEXT.test(trimmed) ? trimmed : null;
}

export function englishCardTags(restaurant: PublicRestaurant): string[] {
  const values = [restaurant.category, ...restaurant.food_tags, ...restaurant.signature_dishes]
    .map(englishStructuredValue)
    .filter((value): value is string => value !== null);
  return [...new Set(values)];
}

export function canonicalCardDescription(restaurant: PublicRestaurant): string | null {
  return (
    englishStructuredValue(restaurant.card_description) ??
    englishStructuredValue(restaurant.description_en)
  );
}

export function compactDescription(restaurant: PublicRestaurant): string | null {
  const enriched = englishStructuredValue(restaurant.card_description);
  if (enriched) return enriched;
  const fallback = englishStructuredValue(restaurant.description_en);
  if (!fallback) return null;
  return fallback
    .split(SENTENCE_BOUNDARY)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
}

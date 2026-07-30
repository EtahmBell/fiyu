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

function firstTwoSentences(value: string): string | null {
  const sentences = value
    .split(SENTENCE_BOUNDARY)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.length >= 2 ? sentences.slice(0, 2).join(" ") : null;
}

function naturalCategory(value: string): string {
  return value
    .replace(/\s*\/\s*/gu, " and ")
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en");
}

function indefiniteArticle(phrase: string): "a" | "an" {
  const firstWord = phrase.match(/[A-Za-z]+/u)?.[0]?.toLocaleLowerCase("en") ?? "";
  if (/^(honest|honor|hour)/u.test(firstWord)) return "an";
  if (/^(uni([^nmd]|$)|use|user|euro|one)/u.test(firstWord)) return "a";
  return /^[aeiou]/u.test(firstWord) ? "an" : "a";
}

function naturalList(values: string[]): string {
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

export function compactDescription(restaurant: PublicRestaurant): string | null {
  const description = englishStructuredValue(restaurant.description_en);
  const existingCopy = description ? firstTwoSentences(description) : null;
  if (existingCopy) return existingCopy;

  const category = englishStructuredValue(restaurant.category);
  const area =
    englishStructuredValue(restaurant.neighborhood) ??
    englishStructuredValue(restaurant.discovery_area);
  const name = englishStructuredValue(restaurant.name_en) ?? "This restaurant";
  const dishes = restaurant.signature_dishes
    .map(englishStructuredValue)
    .filter((value): value is string => value !== null)
    .slice(0, 2);
  const supportingTags = restaurant.food_tags
    .map(englishStructuredValue)
    .filter((value): value is string => value !== null)
    .filter((value) => value.toLocaleLowerCase("en") !== category?.toLocaleLowerCase("en"))
    .slice(0, 2);

  const type = category ? naturalCategory(category) : "restaurant";
  const article = indefiniteArticle(type);
  const first = area
    ? `${name} is ${article} ${type} in ${area}.`
    : `${name} is ${article} ${type}.`;

  if (dishes.length > 0 && supportingTags.length > 0) {
    return `${first} Its listed dishes include ${naturalList(dishes)}, while the restaurant details also note ${naturalList(supportingTags)}.`;
  }
  if (dishes.length > 0) {
    return `${first} Its listed dishes include ${naturalList(dishes)}.`;
  }
  if (supportingTags.length > 0) {
    return `${first} The restaurant details also note ${naturalList(supportingTags)}.`;
  }
  if (area) {
    return `${first} The available listing places this ${type} in the ${area} discovery area.`;
  }
  return category ? `${first} The available listing identifies the restaurant in this category.` : null;
}

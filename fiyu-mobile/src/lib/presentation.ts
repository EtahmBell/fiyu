import type { PublicRestaurant } from "@fiyu/contracts";

const ENGLISH_CHOME = /(?:^|\s)\d+\s*(?:chome|chōme)(?:\s|$)/i;
const JAPANESE_CHOME = /(?:[一二三四五六七八九十〇零\d０-９]+)丁目/;
const POSTAL_OR_NUMBER = /^(?:〒?\d{3}[-‐‑‒–—−]\d{4}|\d+(?:[-‐‑‒–—−]\d+)+)$/;

function text(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function safeArea(value: string | null | undefined): string | null {
  const normalized = text(value);
  if (!normalized || normalized.toLowerCase() === "unknown neighborhood") return null;
  if (ENGLISH_CHOME.test(normalized) || JAPANESE_CHOME.test(normalized) || POSTAL_OR_NUMBER.test(normalized)) return null;
  return normalized;
}

export function restaurantName(restaurant: Pick<PublicRestaurant, "name_ja" | "name_en">): string {
  return text(restaurant.name_ja) ?? text(restaurant.name_en) ?? "Unnamed restaurant";
}

export function restaurantSecondaryName(restaurant: Pick<PublicRestaurant, "name_ja" | "name_en">): string | null {
  const primary = restaurantName(restaurant);
  const english = text(restaurant.name_en);
  return english && english !== primary ? english : null;
}

export function restaurantArea(restaurant: Pick<PublicRestaurant, "display_area" | "neighborhood" | "discovery_area">): string | null {
  return safeArea(restaurant.display_area) ?? safeArea(restaurant.neighborhood) ?? safeArea(restaurant.discovery_area);
}

export function formatFiyuScore(score: number | null): string {
  return score === null || !Number.isFinite(score) ? "—" : (score / 10).toFixed(1);
}

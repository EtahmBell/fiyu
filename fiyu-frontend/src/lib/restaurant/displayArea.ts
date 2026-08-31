type RestaurantAreaFields = {
  display_area?: string | null;
  neighborhood?: string | null;
  discovery_area?: string | null;
};

const ENGLISH_CHOME = /(?:^|\s)\d+\s*(?:chome|chōme)(?:\s|$)/i;
const JAPANESE_CHOME = /(?:[一二三四五六七八九十〇零\d０-９]+)丁目/;
const POSTAL_OR_NUMBER = /^(?:〒?\d{3}[-‐‑‒–—−]\d{4}|\d+(?:[-‐‑‒–—−]\d+)+)$/;

function text(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function safeArea(value: string | null | undefined): string | null {
  const normalized = text(value);
  if (
    !normalized ||
    normalized.toLocaleLowerCase() === "unknown neighborhood" ||
    ENGLISH_CHOME.test(normalized) ||
    JAPANESE_CHOME.test(normalized) ||
    POSTAL_OR_NUMBER.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

/**
 * Human-facing browsing area supplied by the backend's Smart List geography.
 * Fallbacks support rolling deploys but never guess from raw chōme/address data.
 */
export function restaurantDisplayArea(restaurant: RestaurantAreaFields): string | null {
  return safeArea(restaurant.display_area)
    ?? safeArea(restaurant.neighborhood)
    ?? safeArea(restaurant.discovery_area);
}

export function restaurantMetadataParts(
  category: string | null | undefined,
  restaurant: RestaurantAreaFields,
): string[] {
  const values = [text(category), restaurantDisplayArea(restaurant)].filter(
    (value): value is string => value !== null,
  );
  return values.filter(
    (value, index) => values.findIndex(
      (candidate) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase(),
    ) === index,
  );
}

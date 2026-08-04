import type { SmartViewCatalogEntry } from "@/lib/api/schemas";

export const NEARBY_FALLBACK_ORIGIN = {
  latitude: 35.681236,
  longitude: 139.767125,
} as const;

export const SMART_VIEW_ORDER = [
  "recently_saved",
  "fiyu_9_plus",
  "not_visited",
  "by_neighborhood",
  "nearby",
] as const;

export type KnownSmartViewKey = (typeof SMART_VIEW_ORDER)[number];

const orderRank = new Map<string, number>(SMART_VIEW_ORDER.map((key, index) => [key, index]));

export function sortSmartViews(views: SmartViewCatalogEntry[]): SmartViewCatalogEntry[] {
  return [...views].sort((a, b) => {
    const aRank = orderRank.get(a.key) ?? Number.MAX_SAFE_INTEGER;
    const bRank = orderRank.get(b.key) ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a.label.localeCompare(b.label);
  });
}

export function smartViewDescriptionForCard(entry: SmartViewCatalogEntry): string {
  if (entry.key === "fiyu_9_plus") {
    return "Saved restaurants with a 9.0+ Fiyu Score.";
  }
  return entry.description;
}

export function smartViewDisplayLabel(viewKey: string, fallbackLabel: string): string {
  switch (viewKey) {
    case "recently_saved":
      return "Recently saved";
    case "fiyu_9_plus":
      return "Fiyu 9+";
    case "not_visited":
      return "Not visited";
    case "by_neighborhood":
      return "By neighbourhood";
    case "nearby":
      return "Nearby";
    default:
      return fallbackLabel;
  }
}

/**
 * Pale surface identity for a Smart View.
 *
 * Returns one of the Lists tint classes defined in `globals.css`; the class
 * sets the card surface, icon disk and hairline edge together, so a card never
 * ends up with a champagne face and a lavender disk.
 */
export function smartViewTintClass(viewKey: string): string {
  switch (viewKey) {
    case "fiyu_9_plus":
      return "fiyu-tint-champagne";
    case "not_visited":
      return "fiyu-tint-mist";
    case "by_neighborhood":
      return "fiyu-tint-blush";
    case "nearby":
      return "fiyu-tint-spatial";
    case "recently_saved":
    default:
      return "fiyu-tint-lavender";
  }
}

export function smartViewCountLabel(count: number): string {
  if (count === 0) return "No places yet";
  if (count === 1) return "1 place →";
  return `${count} places →`;
}

export function isKnownSmartViewKey(value: string): value is KnownSmartViewKey {
  return SMART_VIEW_ORDER.includes(value as KnownSmartViewKey);
}

export function smartViewTitleFromKey(viewKey: string): string {
  return smartViewDisplayLabel(viewKey, "Smart view");
}

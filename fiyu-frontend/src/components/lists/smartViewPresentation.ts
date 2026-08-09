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
  "ramen_in_shibuya",
  "out_of_the_way_gems",
  "worth_the_detour",
] as const;

export const FREE_SMART_VIEW_KEYS = [
  "recently_saved",
  "fiyu_9_plus",
  "not_visited",
  "by_neighborhood",
  "nearby",
] as const;

export const PREMIUM_SMART_VIEW_KEYS = [
  "ramen_in_shibuya",
  "out_of_the_way_gems",
  "worth_the_detour",
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

export function smartViewDescriptionForCard(
  entry: Pick<SmartViewCatalogEntry, "key" | "description" | "item_count">,
): string {
  if (entry.key === "fiyu_9_plus") {
    return "Saved restaurants with a 9.0+ Fiyu Score.";
  }
  if (entry.key === "nearby") {
    return "Saved places around your current discovery area.";
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
 * ends up with one hue on its face and another on its disk.
 *
 * Every Smart card uses the same near-cream paper so the screen reads as one
 * cohesive editorial surface. Nearby is special through span and motif, not a
 * separate background color.
 */
export function smartViewTintClass(viewKey: string): string {
  void viewKey;
  return "fiyu-tint-paper";
}

export function smartViewCountLabel(count: number): string {
  if (count === 0) return "No places yet";
  if (count === 1) return "1 place →";
  return `${count} places →`;
}

export function smartViewCountLabelMaybe(count: number | null): string | null {
  if (count === null) return null;
  if (count === 0) return "No places yet";
  if (count === 1) return "1 place →";
  return `${count} places →`;
}

export function isPremiumSmartView(entry: SmartViewCatalogEntry): boolean {
  return entry.tier === "premium";
}

export function isUnavailableForMissingArea(entry: SmartViewCatalogEntry): boolean {
  if (entry.available !== false) return false;
  const reason = entry.unavailable_reason?.toLowerCase() ?? "";
  return reason.includes("origin") || reason.includes("discovery area") || reason.includes("area");
}

export function isKnownSmartViewKey(value: string): value is KnownSmartViewKey {
  return SMART_VIEW_ORDER.includes(value as KnownSmartViewKey);
}

export function smartViewTitleFromKey(viewKey: string): string {
  return smartViewDisplayLabel(viewKey, "Smart view");
}

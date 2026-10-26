import type { DeveloperStatus, MyPick, RestaurantVisit, SmartViewCatalogEntry } from "@fiyu/contracts";

export const SMART_VIEW_ORDER = ["recently_saved", "fiyu_9_plus", "not_visited", "by_neighborhood", "nearby", "ramen_in_shibuya", "out_of_the_way_gems", "worth_the_detour"] as const;
export const SMART_VIEW_LABELS: Record<string, string> = { recently_saved: "Recently saved", fiyu_9_plus: "Fiyu 9+", not_visited: "Not visited", by_neighborhood: "By neighbourhood", nearby: "Nearby" };

export function sortSmartViews(views: SmartViewCatalogEntry[]) {
  return [...views].sort((a, b) => {
    const aRank = SMART_VIEW_ORDER.indexOf(a.key as (typeof SMART_VIEW_ORDER)[number]);
    const bRank = SMART_VIEW_ORDER.indexOf(b.key as (typeof SMART_VIEW_ORDER)[number]);
    return (aRank < 0 ? 99 : aRank) - (bRank < 0 ? 99 : bRank) || a.label.localeCompare(b.label);
  });
}

export function newestVisits(visits: RestaurantVisit[]): RestaurantVisit[] { return [...visits].sort((a, b) => b.visited_at.localeCompare(a.visited_at)); }
export function groupVisits(visits: RestaurantVisit[]) {
  return newestVisits(visits).reduce<{ key: string; label: string; visits: RestaurantVisit[] }[]>((groups, visit) => {
    const key = visit.visited_at.slice(0, 7); let group = groups[groups.length - 1];
    if (!group || group.key !== key) { group = { key, label: new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(visit.visited_at)), visits: [] }; groups.push(group); }
    group.visits.push(visit); return groups;
  }, []);
}

export function isDeveloperAuthorized(status: DeveloperStatus | null | undefined) { return status?.enabled === true && status.authorized === true; }
export function canProcessMyPick(item: MyPick) { return ["pending", "resolving_identity", "researching", "failed_retryable", "needs_location"].includes(item.status); }

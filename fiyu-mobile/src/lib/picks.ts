import type { PublicRestaurant, RecentDailyPickRound } from "@fiyu/contracts";

export const RECENT_DISCOVERY_MS = 72 * 60 * 60 * 1000;

export interface RecentDiscovery {
  restaurant: PublicRestaurant;
  revealedAt: string;
  expiresAt: string;
}

export function recentDiscoveries(
  rounds: RecentDailyPickRound[],
  now = Date.now(),
  currentPlaceIds: ReadonlySet<string> = new Set(),
): RecentDiscovery[] {
  const byPlace = new Map<string, RecentDiscovery>();
  for (const round of rounds) {
    const roundExpiry = Date.parse(round.retention_expires_at);
    for (const restaurant of round.restaurants) {
      const revealedAt = round.revealed_at_by_place_id[restaurant.place_id];
      if (!revealedAt || currentPlaceIds.has(restaurant.place_id)) continue;
      const expiresAtMs = Math.min(Date.parse(revealedAt) + RECENT_DISCOVERY_MS, roundExpiry);
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) continue;
      const prior = byPlace.get(restaurant.place_id);
      if (!prior || Date.parse(prior.revealedAt) < Date.parse(revealedAt)) {
        byPlace.set(restaurant.place_id, { restaurant, revealedAt, expiresAt: new Date(expiresAtMs).toISOString() });
      }
    }
  }
  return [...byPlace.values()].sort((a, b) => Date.parse(b.revealedAt) - Date.parse(a.revealedAt));
}

export function budgetLabel(restaurant: PublicRestaurant): string | null {
  const budget = restaurant.budget;
  if (!budget) return null;
  const money = (value: number) => `¥${Math.round(value).toLocaleString("en-US")}`;
  if (budget.minimum !== null && budget.maximum !== null) return `${money(budget.minimum)}–${money(budget.maximum)}`;
  if (budget.minimum !== null) return `${money(budget.minimum)}+`;
  if (budget.maximum !== null) return `Up to ${money(budget.maximum)}`;
  return null;
}

export function budgetLabelPerPerson(restaurant: PublicRestaurant): string | null {
  const value = budgetLabel(restaurant);
  return value ? `${value} per person` : null;
}

export const RECENT_DISCOVERY_DURATION_MS = 72 * 60 * 60 * 1000;

export interface RevealedDiscovery {
  restaurantId: string;
  revealedAt: string;
}

export function recordRevealedDiscovery(
  discoveries: readonly RevealedDiscovery[],
  restaurantId: string,
  now: number,
): RevealedDiscovery[] {
  return [
    ...discoveries.filter((discovery) => discovery.restaurantId !== restaurantId),
    { restaurantId, revealedAt: new Date(now).toISOString() },
  ];
}

export function getDiscoveryExpiration(revealedAt: string): number {
  return Date.parse(revealedAt) + RECENT_DISCOVERY_DURATION_MS;
}

export function discoveryIsRecent(discovery: RevealedDiscovery, now: number): boolean {
  return getDiscoveryExpiration(discovery.revealedAt) > now;
}

export function formatExpirationLabel(expiresAt: number, now: number): string {
  const remaining = expiresAt - now;
  if (remaining <= 0) return "Expired";

  const hours = Math.ceil(remaining / (60 * 60 * 1000));
  if (hours <= 1) return "Expires soon";
  if (hours < 24) return `Expires in ${hours} hours`;

  const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
  return `Expires in ${days} ${days === 1 ? "day" : "days"}`;
}

export function recentDiscoveries(
  discoveries: readonly RevealedDiscovery[],
  currentRestaurantIds: ReadonlySet<string>,
  now: number,
): RevealedDiscovery[] {
  return discoveries
    .filter(
      (discovery) =>
        !currentRestaurantIds.has(discovery.restaurantId) && discoveryIsRecent(discovery, now),
    )
    .sort((left, right) => {
      const byTime = Date.parse(right.revealedAt) - Date.parse(left.revealedAt);
      return byTime || left.restaurantId.localeCompare(right.restaurantId);
    });
}

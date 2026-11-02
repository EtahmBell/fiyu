import type { MyPick } from "@/lib/api/schemas";

const ACTIVE_STATUSES = new Set<MyPick["status"]>([
  "pending",
  "resolving_identity",
  "researching",
  "failed_retryable",
]);

export function isMyPickResultReady(item: MyPick): boolean {
  return item.result_ready || (item.fiyu_score !== null && item.score_version !== null);
}

export function myPickFeaturedDeadline(item: MyPick): number | null {
  if (!item.featured_until) return null;
  const deadline = Date.parse(item.featured_until);
  return Number.isFinite(deadline) ? deadline : null;
}

export function isMyPickHomepageVisible(item: MyPick, now = Date.now()): boolean {
  if (ACTIVE_STATUSES.has(item.status)) return true;
  const deadline = myPickFeaturedDeadline(item);
  // Rolling-deploy safety: the previous authenticated response had no
  // featured_until field, so preserve its presentation until the backend
  // exposing the canonical deadline is live.
  return deadline === null ? true : deadline > now;
}

export function completedMyPicks(items: readonly MyPick[]): MyPick[] {
  return [...items]
    .filter(isMyPickResultReady)
    .toSorted((left, right) => {
      const leftTime = myPickFeaturedDeadline(left)
        ?? Date.parse(left.resolved_at ?? left.created_at);
      const rightTime = myPickFeaturedDeadline(right)
        ?? Date.parse(right.resolved_at ?? right.created_at);
      return rightTime - leftTime;
    });
}

export function nextMyPickExpiry(items: readonly MyPick[], now = Date.now()): number | null {
  const deadlines = items
    .map(myPickFeaturedDeadline)
    .filter((deadline): deadline is number => deadline !== null && deadline > now);
  return deadlines.length > 0 ? Math.min(...deadlines) : null;
}

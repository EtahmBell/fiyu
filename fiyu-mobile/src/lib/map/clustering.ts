import type { Point } from "./projection";
export interface ClusterInput<T> { id: string; point: Point; item: T }
export interface MarkerCluster<T> { id: string; point: Point; members: ClusterInput<T>[] }
export const BASE_CELL_SIZE = 64;
export function clusterLevelForScale(scale: number) { return Number.isFinite(scale) ? Math.min(4, Math.max(1, Math.floor(Math.max(1, scale) + 0.5))) : 1; }
export function clusterMarkers<T>(inputs: readonly ClusterInput<T>[], scale = 1): MarkerCluster<T>[] { const level = clusterLevelForScale(scale); const cell = BASE_CELL_SIZE / level; const groups = new Map<string, ClusterInput<T>[]>(); for (const input of [...inputs].sort((a, b) => a.id.localeCompare(b.id))) { const key = level === 4 ? `p:${input.point.x}:${input.point.y}` : `c:${Math.floor(input.point.x / cell)}:${Math.floor(input.point.y / cell)}`; groups.set(key, [...(groups.get(key) ?? []), input]); } return [...groups.values()].map((members) => ({ id: members.length === 1 ? members[0].id : `cluster:${members.map((member) => member.id).join("|")}`, point: { x: Math.round((members.reduce((sum, member) => sum + member.point.x, 0) / members.length) * 100) / 100, y: Math.round((members.reduce((sum, member) => sum + member.point.y, 0) / members.length) * 100) / 100 }, members })).sort((a, b) => a.id.localeCompare(b.id)); }
export function spiderfyMarkers<T>(inputs: readonly ClusterInput<T>[], scale = 1): MarkerCluster<T>[] { const ordered = [...inputs].sort((a, b) => a.id.localeCompare(b.id)); const anchor = { x: ordered.reduce((sum, item) => sum + item.point.x, 0) / ordered.length, y: ordered.reduce((sum, item) => sum + item.point.y, 0) / ordered.length }; return ordered.map((member, index) => { const angle = -Math.PI / 2 + index * 2 * Math.PI / ordered.length; const radius = 30 / Math.max(1, scale); return { id: member.id, point: { x: Math.round((anchor.x + Math.cos(angle) * radius) * 100) / 100, y: Math.round((anchor.y + Math.sin(angle) * radius) * 100) / 100 }, members: [member] }; }); }

export function planClusterExpansion<T>(members: readonly ClusterInput<T>[], currentScale: number, maxScale = 4): { mode: "separable" | "spiderfy"; targetScale: number } {
  const start = Math.min(maxScale, Math.max(currentScale * 1.35, currentScale + 0.5));
  let requiredScale = start;
  for (let left = 0; left < members.length; left += 1) for (let right = left + 1; right < members.length; right += 1) {
    const distance = Math.hypot(members[left].point.x - members[right].point.x, members[left].point.y - members[right].point.y);
    if (distance === 0) return { mode: "spiderfy", targetScale: maxScale };
    requiredScale = Math.max(requiredScale, 24 / distance);
  }
  let stableScale = maxScale;
  for (let level = clusterLevelForScale(start); level <= clusterLevelForScale(maxScale); level += 1) {
    if (clusterMarkers(members, level).every((cluster) => cluster.members.length === 1)) { stableScale = Math.max(start, level <= 1 ? 1 : level - 0.5); break; }
  }
  const needed = Math.max(requiredScale, stableScale);
  return { mode: "separable", targetScale: Math.min(maxScale, start + Math.ceil(Math.max(0, needed - start) / 0.25) * 0.25) };
}

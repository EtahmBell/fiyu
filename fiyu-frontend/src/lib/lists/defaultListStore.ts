import {
  addRestaurantToDefaultList,
  fetchDefaultList,
  removeRestaurantFromDefaultList,
  type ListIdentity,
} from "@/lib/api/client";
import { FiyuApiError, type FiyuErrorKind } from "@/lib/api/errors";
import type { DefaultListResponse } from "@/lib/api/schemas";
import {
  DAILY_PICKS_STORAGE_KEY,
  parseDailyPicksState,
  type DailyPicksState,
} from "@/lib/daily-picks/storage";
import { getOrCreateAnonymousOwnerKey } from "@/lib/lists/identity";

const TOKYO_CITY_ID = "tokyo";
const MIGRATION_KEY = "fiyu.lists.migration.v1";

type ListLoadStatus = "idle" | "loading" | "ready" | "error";

export interface DefaultListSnapshot {
  cityId: string;
  status: ListLoadStatus;
  list: DefaultListResponse | null;
  savedPlaceIds: string[];
  pendingPlaceIds: string[];
  error: FiyuApiError | null;
  operationError: string | null;
}

function parseIso(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortedSavedIds(list: DefaultListResponse | null): string[] {
  if (!list) return [];
  return [...list.items]
    .sort((a, b) => parseIso(b.added_at) - parseIso(a.added_at))
    .map((item) => item.place_id);
}

function writeLegacySavedIds(savedPlaceIds: string[]): void {
  if (typeof window === "undefined") return;
  const current = parseDailyPicksState(window.localStorage.getItem(DAILY_PICKS_STORAGE_KEY));
  const next: DailyPicksState = { ...current, savedRestaurantIds: savedPlaceIds };
  window.localStorage.setItem(DAILY_PICKS_STORAGE_KEY, JSON.stringify(next));
}

function readLegacySavedIds(): string[] {
  if (typeof window === "undefined") return [];
  return parseDailyPicksState(window.localStorage.getItem(DAILY_PICKS_STORAGE_KEY)).savedRestaurantIds;
}

function isUnsupportedCityError(error: FiyuApiError): boolean {
  return error.kind === "invalid-request" && (error.detail ?? "").toLowerCase().includes("unsupported city");
}

function canIgnoreMigrationErrorKind(kind: FiyuErrorKind): boolean {
  return kind === "not-found" || kind === "invalid-request";
}

export class DefaultListStore {
  private readonly cityId: string;
  private readonly accountId: string | null;
  private readonly serverSnapshot: DefaultListSnapshot;
  private readonly listeners = new Set<() => void>();
  private snapshot: DefaultListSnapshot;
  private loadingPromise: Promise<void> | null = null;
  private mutationInFlight = new Set<string>();

  constructor(cityId: string, accountId: string | null = null) {
    this.cityId = cityId;
    this.accountId = accountId;
    const initialError =
      cityId === TOKYO_CITY_ID
        ? null
        : new FiyuApiError({
            kind: "invalid-request",
            endpoint: "/lists/default",
            detail: `Unsupported city: ${cityId}`,
          });
    this.snapshot = {
      cityId,
      status: cityId === TOKYO_CITY_ID ? "idle" : "error",
      list: null,
      savedPlaceIds: [],
      pendingPlaceIds: [],
      error: initialError,
      operationError: null,
    };
    this.serverSnapshot = { ...this.snapshot };
  }

  getSnapshot = (): DefaultListSnapshot => this.snapshot;

  getServerSnapshot = (): DefaultListSnapshot => this.serverSnapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  resetAccountState(): void {
    this.loadingPromise = null;
    this.mutationInFlight.clear();
    this.snapshot = { ...this.serverSnapshot };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private update(next: Partial<DefaultListSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...next,
      pendingPlaceIds: [...this.mutationInFlight],
    };
    this.emit();
  }

  private identity(): ListIdentity {
    return { clientId: getOrCreateAnonymousOwnerKey() };
  }

  private migrationDone(clientId: string): boolean {
    if (typeof window === "undefined") return true;
    const raw = window.localStorage.getItem(MIGRATION_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw) as { version?: number; city_id?: string; owner_key?: string };
      return data.version === 1 && data.city_id === this.cityId && data.owner_key === clientId;
    } catch {
      return false;
    }
  }

  private markMigrationDone(clientId: string, legacyCount: number, ignoredCount: number): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      MIGRATION_KEY,
      JSON.stringify({
        version: 1,
        city_id: this.cityId,
        owner_key: clientId,
        legacy_count: legacyCount,
        ignored_count: ignoredCount,
        completed_at: new Date().toISOString(),
      }),
    );
  }

  private async migrateLegacySaves(identity: ListIdentity): Promise<void> {
    if (typeof window === "undefined") return;
    // Legacy local saves belong to the anonymous browser owner. Importing them
    // while authenticated can copy one signed-in user's local mirror into a
    // different account after an account switch.
    if (this.accountId) return;
    if (this.migrationDone(identity.clientId)) return;

    const legacyIds = readLegacySavedIds();
    if (legacyIds.length === 0) {
      this.markMigrationDone(identity.clientId, 0, 0);
      return;
    }

    let ignoredCount = 0;
    for (const placeId of legacyIds) {
      try {
        await addRestaurantToDefaultList(this.cityId, placeId, identity);
      } catch (error) {
        if (error instanceof FiyuApiError && canIgnoreMigrationErrorKind(error.kind)) {
          ignoredCount += 1;
          continue;
        }
        throw error;
      }
    }

    this.markMigrationDone(identity.clientId, legacyIds.length, ignoredCount);
  }

  async ensureLoaded(): Promise<void> {
    if (this.cityId !== TOKYO_CITY_ID) return;
    if (this.snapshot.status === "ready") return;
    if (this.loadingPromise) return this.loadingPromise;

    this.update({ status: "loading", error: null, operationError: null });
    this.loadingPromise = (async () => {
      const identity = this.identity();
      try {
        await this.migrateLegacySaves(identity);
        const list = await fetchDefaultList(this.cityId, identity);
        const savedPlaceIds = sortedSavedIds(list);
        if (!this.accountId) writeLegacySavedIds(savedPlaceIds);
        this.update({
          status: "ready",
          list,
          savedPlaceIds,
          error: null,
          operationError: null,
        });
      } catch (error) {
        const resolved =
          error instanceof FiyuApiError
            ? error
            : new FiyuApiError({
                kind: "unknown",
                endpoint: "/lists/default",
                detail: error instanceof Error ? error.message : "Unknown failure",
                cause: error,
              });
        this.update({ status: "error", error: resolved, operationError: null });
      } finally {
        this.loadingPromise = null;
      }
    })();

    return this.loadingPromise;
  }

  async retry(): Promise<void> {
    this.loadingPromise = null;
    await this.ensureLoaded();
  }

  isSaved(placeId: string): boolean {
    return this.snapshot.savedPlaceIds.includes(placeId);
  }

  private optimisticUpdate(placeId: string, saved: boolean): DefaultListResponse | null {
    if (!this.snapshot.list) return null;
    const existing = this.snapshot.list;
    const items = saved
      ? existing.items.filter((item) => item.place_id !== placeId)
      : [
          {
            place_id: placeId,
            added_at: new Date().toISOString(),
            restaurant: {
              place_id: placeId,
              name_ja: null,
              name_en: null,
              primary_category: null,
              neighborhood: null,
              fiyu_score: null,
              score_band: null,
            },
          },
          ...existing.items.filter((item) => item.place_id !== placeId),
        ];

    return {
      ...existing,
      item_count: items.length,
      items,
      updated_at: new Date().toISOString(),
    };
  }

  async toggle(placeId: string): Promise<void> {
    if (this.cityId !== TOKYO_CITY_ID) return;
    if (this.mutationInFlight.has(placeId)) return;

    const clickedSaved = this.isSaved(placeId);
    const previous = this.snapshot;
    const optimisticSavedPlaceIds = clickedSaved
      ? previous.savedPlaceIds.filter((id) => id !== placeId)
      : [placeId, ...previous.savedPlaceIds.filter((id) => id !== placeId)];

    this.mutationInFlight.add(placeId);
    this.update({
      savedPlaceIds: optimisticSavedPlaceIds,
      operationError: null,
    });

    try {
      await this.ensureLoaded();
      if (this.snapshot.status !== "ready" || !this.snapshot.list) {
        throw this.snapshot.error ??
          new FiyuApiError({
            kind: "unknown",
            endpoint: "/lists/default",
            detail: "Could not load the Tokyo list",
          });
      }

      const identity = this.identity();
      const optimisticList = this.optimisticUpdate(placeId, clickedSaved);
      if (optimisticList) {
        this.update({ list: optimisticList, savedPlaceIds: sortedSavedIds(optimisticList) });
      }

      const mutation = clickedSaved
        ? await removeRestaurantFromDefaultList(this.cityId, placeId, identity)
        : await addRestaurantToDefaultList(this.cityId, placeId, identity);
      const sorted = sortedSavedIds(mutation.list);
      if (!this.accountId) writeLegacySavedIds(sorted);
      this.update({ list: mutation.list, savedPlaceIds: sorted, operationError: null });
    } catch (error) {
      const resolved =
        error instanceof FiyuApiError
          ? error
          : new FiyuApiError({
              kind: "unknown",
              endpoint: "/lists/default/items",
              detail: error instanceof Error ? error.message : "Unknown failure",
              cause: error,
            });
      if (process.env.NODE_ENV !== "production") {
        // Development-only diagnostics to trace backend contract mismatches.
        // Keep user-facing copy restrained and generic.
        console.error("[default-list] mutation failed", {
          cityId: this.cityId,
          placeId,
          attemptedAction: clickedSaved ? "remove" : "add",
          status: resolved.status,
          endpoint: resolved.endpoint,
          kind: resolved.kind,
          detail: resolved.detail,
        });
      }
      this.update({
        list: previous.list,
        savedPlaceIds: previous.savedPlaceIds,
        operationError: isUnsupportedCityError(resolved)
          ? "Saving is unavailable in this city right now."
          : "Could not update saved status. Please try again.",
        error: resolved.kind === "not-found" ? null : this.snapshot.error,
      });
    } finally {
      this.mutationInFlight.delete(placeId);
      this.update({});
    }
  }
}

const stores = new Map<string, DefaultListStore>();

if (typeof window !== "undefined") {
  window.addEventListener("fiyu:account-changed", () => {
    for (const store of stores.values()) store.resetAccountState();
  });
}

export function defaultListStoreForCity(
  cityId: string,
  accountId: string | null = null,
): DefaultListStore {
  const normalized = cityId.trim().toLowerCase();
  const key = `${normalized}:${accountId ?? "anonymous"}`;
  const existing = stores.get(key);
  if (existing) return existing;
  const created = new DefaultListStore(normalized, accountId);
  stores.set(key, created);
  return created;
}

import {
  DEFAULT_DAILY_PREFERENCES,
  JAPANESE_FOOD_PREFERENCES,
  type DailyPreferences,
  type JapaneseFoodPreference,
  type NonJapanesePreference,
} from "@/lib/daily-picks/selection";
import type { RevealedDiscovery } from "@/lib/daily-picks/history";

export const DAILY_PICKS_STORAGE_KEY = "fiyu.daily-picks.v1";
export const DAILY_PICKS_DURATION_MS = 24 * 60 * 60 * 1000;

export interface DailyRestaurantSelection {
  restaurantIds: string[];
  revealedIds: string[];
  generatedAt: string;
  expiresAt: string;
}

export interface DailyPicksState {
  version: 2 | 3;
  preferences: DailyPreferences;
  selection: DailyRestaurantSelection | null;
  discoveries: RevealedDiscovery[];
  savedRestaurantIds: string[];
  /** Local mirror/legacy seed only; backend history is authoritative in production. */
  servedRestaurantIds?: string[];
}

export const EMPTY_DAILY_PICKS_STATE: DailyPicksState = {
  version: 3,
  preferences: DEFAULT_DAILY_PREFERENCES,
  selection: null,
  discoveries: [],
  savedRestaurantIds: [],
  servedRestaurantIds: [],
};

export interface DailyPicksStorage {
  getSnapshot(): DailyPicksState | null;
  getServerSnapshot(): null;
  subscribe(listener: () => void): () => void;
  save(state: DailyPicksState): void;
}

function validPreferences(value: unknown): DailyPreferences {
  if (!value || typeof value !== "object") return DEFAULT_DAILY_PREFERENCES;
  const raw = value as { categories?: unknown; nonJapanese?: unknown };
  const allowedCategories = new Set<string>(JAPANESE_FOOD_PREFERENCES.map((item) => item.id));
  const categories = Array.isArray(raw.categories)
    ? [
        ...new Set(
          raw.categories.filter(
            (item): item is JapaneseFoodPreference =>
              typeof item === "string" && allowedCategories.has(item),
          ),
        ),
      ].slice(0, 3)
    : [];
  const allowedNonJapanese = new Set<NonJapanesePreference>([
    "yes",
    "occasionally",
    "japanese-only",
  ]);
  return {
    categories,
    nonJapanese: allowedNonJapanese.has(raw.nonJapanese as NonJapanesePreference)
      ? (raw.nonJapanese as NonJapanesePreference)
      : DEFAULT_DAILY_PREFERENCES.nonJapanese,
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))]
    : [];
}

function validDiscoveries(value: unknown): RevealedDiscovery[] {
  if (!Array.isArray(value)) return [];
  const latest = new Map<string, RevealedDiscovery>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as { restaurantId?: unknown; revealedAt?: unknown };
    if (
      typeof raw.restaurantId !== "string" ||
      raw.restaurantId.length === 0 ||
      typeof raw.revealedAt !== "string" ||
      !Number.isFinite(Date.parse(raw.revealedAt))
    ) {
      continue;
    }
    const current = latest.get(raw.restaurantId);
    if (!current || Date.parse(raw.revealedAt) > Date.parse(current.revealedAt)) {
      latest.set(raw.restaurantId, {
        restaurantId: raw.restaurantId,
        revealedAt: raw.revealedAt,
      });
    }
  }
  return [...latest.values()];
}

export function parseDailyPicksState(raw: string | null): DailyPicksState {
  if (!raw) return EMPTY_DAILY_PICKS_STATE;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const selectionValue = value.selection as Record<string, unknown> | null;
    const restaurantIds = selectionValue ? stringList(selectionValue.restaurantIds) : [];
    const generatedAt = selectionValue?.generatedAt;
    const expiresAt = selectionValue?.expiresAt;
    const selection =
      restaurantIds.length === 3 &&
      typeof generatedAt === "string" &&
      Number.isFinite(Date.parse(generatedAt)) &&
      typeof expiresAt === "string" &&
      Number.isFinite(Date.parse(expiresAt))
        ? {
            restaurantIds,
            revealedIds: stringList(selectionValue?.revealedIds).filter((id) =>
              restaurantIds.includes(id),
            ),
            generatedAt,
            expiresAt,
          }
        : null;
    const hasStoredDiscoveries = Array.isArray(value.discoveries);
    const storedDiscoveries = validDiscoveries(value.discoveries);
    const discoveries =
      hasStoredDiscoveries || !selection
        ? storedDiscoveries
        : selection.revealedIds.map((restaurantId) => ({
            restaurantId,
            revealedAt: selection.generatedAt,
          }));
    const explicitServedIds = stringList(value.servedRestaurantIds);
    const servedRestaurantIds = [
      ...new Set([
        ...explicitServedIds,
        ...(selection?.restaurantIds ?? []),
        ...discoveries.map((discovery) => discovery.restaurantId),
      ]),
    ];
    return {
      version: 3,
      preferences: validPreferences(value.preferences),
      selection,
      discoveries,
      savedRestaurantIds: stringList(value.savedRestaurantIds),
      servedRestaurantIds,
    };
  } catch {
    return EMPTY_DAILY_PICKS_STATE;
  }
}

export function createDailySelection(
  restaurantIds: string[],
  now: number,
): DailyRestaurantSelection {
  if (new Set(restaurantIds).size !== 3) {
    throw new Error("A daily selection requires exactly three unique restaurant IDs");
  }
  return {
    restaurantIds: [...restaurantIds],
    revealedIds: [],
    generatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + DAILY_PICKS_DURATION_MS).toISOString(),
  };
}

export function selectionIsActive(selection: DailyRestaurantSelection, now: number): boolean {
  return Date.parse(selection.expiresAt) > now;
}

export function createDailyPicksStorage(storage: Storage): DailyPicksStorage {
  let cachedRaw: string | null | undefined;
  let cachedState: DailyPicksState | null = null;
  const listeners = new Set<() => void>();
  const read = () => {
    const raw = storage.getItem(DAILY_PICKS_STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedState = parseDailyPicksState(raw);
    }
    return cachedState ?? EMPTY_DAILY_PICKS_STATE;
  };
  return {
    getSnapshot: read,
    getServerSnapshot: () => null,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    save(state) {
      storage.setItem(DAILY_PICKS_STORAGE_KEY, JSON.stringify(state));
      cachedRaw = undefined;
      for (const listener of listeners) listener();
    },
  };
}

const INERT_STORAGE: DailyPicksStorage = {
  getSnapshot: () => null,
  getServerSnapshot: () => null,
  subscribe: () => () => undefined,
  save: () => undefined,
};

export function browserDailyPicksStorage(): DailyPicksStorage {
  return typeof window === "undefined"
    ? INERT_STORAGE
    : createDailyPicksStorage(window.localStorage);
}

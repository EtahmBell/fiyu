"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

import { ConcealedRestaurantCard } from "@/components/daily-picks/ConcealedRestaurantCard";
import { Button } from "@/components/ui/Button";
import type { PublicRestaurant } from "@/lib/api/schemas";
import {
  JAPANESE_FOOD_PREFERENCES,
  selectDailyRestaurants,
  type DailyPreferences,
  type JapaneseFoodPreference,
  type NonJapanesePreference,
} from "@/lib/daily-picks/selection";
import {
  DAILY_PICKS_DURATION_MS,
  EMPTY_DAILY_PICKS_STATE,
  browserDailyPicksStorage,
  createDailySelection,
  selectionIsActive,
  type DailyPicksState,
  type DailyPicksStorage,
} from "@/lib/daily-picks/storage";

export interface DailyPicksPanelProps {
  restaurants: PublicRestaurant[];
  activeArea?: string | null;
  storage?: DailyPicksStorage;
}

const subscribeClock = (listener: () => void) => {
  const timer = window.setInterval(listener, 1000);
  return () => window.clearInterval(timer);
};
const currentSecond = () => Math.floor(Date.now() / 1000) * 1000;
const serverSecond = () => 0;

function remainingLabel(milliseconds: number): string {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${minutes}m`;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function PreferenceControls({
  preferences,
  onChange,
}: {
  preferences: DailyPreferences;
  onChange(preferences: DailyPreferences): void;
}) {
  const toggleCategory = (category: JapaneseFoodPreference) => {
    const selected = preferences.categories.includes(category);
    onChange({
      ...preferences,
      categories: selected
        ? preferences.categories.filter((item) => item !== category)
        : [...preferences.categories, category],
    });
  };

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="text-xs font-medium text-ink-muted">Interested in</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {JAPANESE_FOOD_PREFERENCES.map((preference) => {
            const selected = preferences.categories.includes(preference.id);
            return (
              <button
                key={preference.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleCategory(preference.id)}
                className={
                  selected
                    ? "min-h-9 rounded-chip border border-lavender-600 bg-lavender-50 px-3 text-xs font-medium text-lavender-700"
                    : "min-h-9 rounded-chip border border-line bg-surface px-3 text-xs text-ink-muted hover:border-line-strong"
                }
              >
                {preference.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[0.6875rem] text-ink-faint">Leave blank for any Japanese food.</p>
      </fieldset>

      <label className="flex items-center justify-between gap-4 text-xs font-medium text-ink-muted">
        Non-Japanese restaurants
        <select
          value={preferences.nonJapanese}
          onChange={(event) =>
            onChange({
              ...preferences,
              nonJapanese: event.target.value as NonJapanesePreference,
            })
          }
          className="min-h-10 rounded-lg border border-line bg-surface px-3 text-xs text-ink"
        >
          <option value="yes">Yes</option>
          <option value="occasionally">Occasionally</option>
          <option value="japanese-only">Japanese only</option>
        </select>
      </label>
    </div>
  );
}

export function DailyPicksPanel({
  restaurants,
  activeArea = null,
  storage: injectedStorage,
}: DailyPicksPanelProps) {
  const browserStorage = useMemo(() => browserDailyPicksStorage(), []);
  const storage = injectedStorage ?? browserStorage;
  const snapshot = useSyncExternalStore(
    storage.subscribe,
    storage.getSnapshot,
    storage.getServerSnapshot,
  );
  const now = useSyncExternalStore(subscribeClock, currentSecond, serverSecond);
  const [inventoryMessage, setInventoryMessage] = useState<string | null>(null);

  const state = snapshot ?? EMPTY_DAILY_PICKS_STATE;
  const selection = snapshot?.selection ?? null;
  const selectedRestaurants = useMemo(() => {
    if (!selection) return [];
    const byId = new Map(restaurants.map((restaurant) => [restaurant.place_id, restaurant]));
    return selection.restaurantIds
      .map((id) => byId.get(id))
      .filter((restaurant): restaurant is PublicRestaurant => Boolean(restaurant));
  }, [restaurants, selection]);
  const active = selection ? selectionIsActive(selection, now) : false;

  const persist = useCallback(
    (next: DailyPicksState) => {
      storage.save(next);
    },
    [storage],
  );

  const updatePreferences = (preferences: DailyPreferences) => {
    persist({ ...state, preferences });
  };

  const generate = () => {
    const generatedAt = Date.now();
    const picks = selectDailyRestaurants(restaurants, state.preferences, {
      activeArea,
      seed: Math.floor(generatedAt / DAILY_PICKS_DURATION_MS),
    });
    if (picks.length !== 3) {
      setInventoryMessage("Not enough matching restaurants are available yet.");
      return;
    }
    setInventoryMessage(null);
    persist({
      ...state,
      selection: createDailySelection(
        picks.map((restaurant) => restaurant.place_id),
        generatedAt,
      ),
    });
  };

  const reveal = (placeId: string) => {
    if (!selection || selection.revealedIds.includes(placeId)) return;
    persist({
      ...state,
      selection: {
        ...selection,
        revealedIds: [...selection.revealedIds, placeId],
      },
    });
  };

  const toggleSaved = (placeId: string) => {
    const saved = state.savedRestaurantIds.includes(placeId);
    persist({
      ...state,
      savedRestaurantIds: saved
        ? state.savedRestaurantIds.filter((id) => id !== placeId)
        : [...state.savedRestaurantIds, placeId],
    });
  };

  return (
    <section
      aria-labelledby="daily-picks-heading"
      className="my-5 rounded-card border border-line bg-surface p-4 shadow-[0_8px_30px_-24px_rgba(49,40,61,0.3)] sm:p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.625rem] font-medium tracking-[0.16em] text-lavender-700 uppercase">
            Daily discovery
          </p>
          <h2 id="daily-picks-heading" className="mt-1 font-display text-2xl text-ink">
            Today&apos;s Fiyu Picks
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Three editorial picks shaped by what sounds good today.
          </p>
        </div>
      </div>

      {snapshot === null ? (
        <p className="mt-4 min-h-11 text-sm text-ink-faint" data-testid="daily-picks-hydrating">
          Loading today&apos;s selection…
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <PreferenceControls preferences={state.preferences} onChange={updatePreferences} />

          {selection && selectedRestaurants.length === 3 && (
            <div className="space-y-3" aria-label="Today’s restaurants">
              {selectedRestaurants.map((restaurant, index) => (
                <ConcealedRestaurantCard
                  key={restaurant.place_id}
                  restaurant={restaurant}
                  position={index + 1}
                  revealed={selection.revealedIds.includes(restaurant.place_id)}
                  saved={state.savedRestaurantIds.includes(restaurant.place_id)}
                  onReveal={() => reveal(restaurant.place_id)}
                  onToggleSaved={() => toggleSaved(restaurant.place_id)}
                />
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={generate} disabled={active}>
              Receive today&apos;s restaurants
            </Button>
            {selection && active && (
              <p className="text-xs text-ink-muted" aria-live="polite">
                Next selection available in {remainingLabel(Date.parse(selection.expiresAt) - now)}
              </p>
            )}
            {selection && !active && (
              <p className="text-xs text-ink-muted">A new selection is available.</p>
            )}
          </div>

          {inventoryMessage && (
            <p role="status" className="text-xs text-ink-muted">
              {inventoryMessage}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

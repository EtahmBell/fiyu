"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { ConcealedRestaurantCard } from "@/components/daily-picks/ConcealedRestaurantCard";
import { CityLoadingSequence } from "@/components/city-signature/CitySignature";
import {
  DailyCardFrame,
  type DailyCardRefRegistrar,
} from "@/components/daily-picks/DailyCardFrame";
import { RecentDiscoveries } from "@/components/daily-picks/RecentDiscoveries";
import { FreeOriginOnboarding } from "@/components/location/FreeOriginOnboarding";
import { Button } from "@/components/ui/Button";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { ACTIVE_FIYU_CITY } from "@/lib/city/editions";
import {
  JAPANESE_FOOD_PREFERENCES,
  selectDailyRestaurants,
  type DailyPreferences,
  type JapaneseFoodPreference,
  type NonJapanesePreference,
} from "@/lib/daily-picks/selection";
import { recentDiscoveries, recordRevealedDiscovery } from "@/lib/daily-picks/history";
import type { FreeOriginSetup } from "@/lib/location/origin";
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
  onOpenRestaurant?: (restaurant: PublicRestaurant) => void;
  onVisibleRestaurantIdsChange?: (restaurantIds: string[]) => void;
  selectedPlaceId?: string | null;
  scrollToPlaceId?: string | null;
  scrollRequestKey?: number;
  originSetup?: FreeOriginSetup;
}

const subscribeClock = (listener: () => void) => {
  const timer = window.setInterval(listener, 60_000);
  return () => window.clearInterval(timer);
};
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const serverMinute = () => 0;

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
    if (!selected && preferences.categories.length >= 3) return;
    onChange({
      ...preferences,
      categories: selected
        ? preferences.categories.filter((item) => item !== category)
        : [...preferences.categories, category],
    });
  };

  return (
    <div className="space-y-5" data-testid="pre-pick-preferences">
      <fieldset>
        <legend className="text-sm font-medium text-ink">
          <span className="mr-2 text-xs font-semibold tracking-[0.1em] text-lavender-700 uppercase">
            Step 1
          </span>
          Food interests
        </legend>
        <p className="mt-1 text-xs text-ink-muted">Choose up to three, or let Fiyu surprise you.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {JAPANESE_FOOD_PREFERENCES.map((preference) => {
            const selected = preferences.categories.includes(preference.id);
            return (
              <button
                key={preference.id}
                type="button"
                aria-pressed={selected}
                disabled={!selected && preferences.categories.length >= 3}
                onClick={() => toggleCategory(preference.id)}
                className={
                  selected
                    ? "min-h-11 rounded-chip border border-lavender-600 bg-lavender-100 px-4 text-sm font-medium text-lavender-800 shadow-sm"
                    : "min-h-11 rounded-chip border border-line bg-surface px-4 text-sm text-ink-muted hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-40"
                }
              >
                {preference.label}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={preferences.categories.length === 0}
            onClick={() => onChange({ ...preferences, categories: [] })}
            className={
              preferences.categories.length === 0
                ? "min-h-11 rounded-chip border border-plum bg-plum px-4 text-sm font-medium text-white shadow-sm"
                : "min-h-11 rounded-chip border border-line-strong bg-surface px-4 text-sm font-medium text-plum hover:border-plum"
            }
          >
            Surprise me
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-ink">
          <span className="mr-2 text-xs font-semibold tracking-[0.1em] text-lavender-700 uppercase">
            Step 2
          </span>
          Non-Japanese restaurants
        </legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([
            ["japanese-only", "Japanese only"],
            ["occasionally", "Mostly Japanese"],
            ["yes", "Open to anything"],
          ] as const satisfies readonly (readonly [NonJapanesePreference, string])[]).map(
            ([value, label]) => {
              const selected = preferences.nonJapanese === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange({ ...preferences, nonJapanese: value })}
                  className={
                    selected
                      ? "min-h-11 rounded-lg border border-lavender-600 bg-lavender-100 px-3 text-sm font-medium text-lavender-800 shadow-sm"
                      : "min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink-muted hover:border-line-strong"
                  }
                >
                  {label}
                </button>
              );
            },
          )}
        </div>
      </fieldset>
    </div>
  );
}

export function DailyPicksPanel({
  restaurants,
  activeArea = null,
  storage: injectedStorage,
  onOpenRestaurant,
  onVisibleRestaurantIdsChange,
  selectedPlaceId = null,
  scrollToPlaceId = null,
  scrollRequestKey = 0,
  originSetup,
}: DailyPicksPanelProps) {
  const browserStorage = useMemo(() => browserDailyPicksStorage(), []);
  const storage = injectedStorage ?? browserStorage;
  const snapshot = useSyncExternalStore(
    storage.subscribe,
    storage.getSnapshot,
    storage.getServerSnapshot,
  );
  const now = useSyncExternalStore(subscribeClock, currentMinute, serverMinute);
  const [inventoryMessage, setInventoryMessage] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const findingTimerRef = useRef<number | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  const state = snapshot ?? EMPTY_DAILY_PICKS_STATE;
  const selection = snapshot?.selection ?? null;
  const active = selection ? selectionIsActive(selection, now) : false;
  const currentSelection = active ? selection : null;
  const selectedRestaurants = useMemo(() => {
    if (!currentSelection) return [];
    const byId = new Map(restaurants.map((restaurant) => [restaurant.place_id, restaurant]));
    return currentSelection.restaurantIds
      .map((id) => byId.get(id))
      .filter((restaurant): restaurant is PublicRestaurant => Boolean(restaurant));
  }, [currentSelection, restaurants]);
  const hasActivePicks = active && selectedRestaurants.length === 3;
  const recent = useMemo(
    () =>
      recentDiscoveries(
        state.discoveries,
        new Set(currentSelection?.restaurantIds ?? []),
        now,
      ),
    [currentSelection?.restaurantIds, now, state.discoveries],
  );
  const visibleRestaurantIds = useMemo(
    () =>
      [...new Set([
        ...(currentSelection?.restaurantIds ?? []),
        ...recent.map((discovery) => discovery.restaurantId),
      ])].sort(),
    [currentSelection?.restaurantIds, recent],
  );

  const registerCardRef = useCallback<DailyCardRefRegistrar>((placeId, node) => {
    if (node) cardRefs.current.set(placeId, node);
    else cardRefs.current.delete(placeId);
  }, []);

  useEffect(() => {
    if (!scrollToPlaceId) return;
    const card = cardRefs.current.get(scrollToPlaceId);
    if (!card) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    card.focus({ preventScroll: true });
  }, [scrollRequestKey, scrollToPlaceId]);

  useEffect(() => {
    if (snapshot !== null) onVisibleRestaurantIdsChange?.(visibleRestaurantIds);
  }, [onVisibleRestaurantIdsChange, snapshot, visibleRestaurantIds]);

  useEffect(
    () => () => {
      if (findingTimerRef.current !== null) window.clearTimeout(findingTimerRef.current);
    },
    [],
  );

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
    setFinding(true);
    persist({
      ...state,
      selection: createDailySelection(
        picks.map((restaurant) => restaurant.place_id),
        generatedAt,
      ),
    });
    findingTimerRef.current = window.setTimeout(() => {
      setFinding(false);
      findingTimerRef.current = null;
    }, 850);
  };

  const reveal = (placeId: string, revealedAt: number) => {
    if (!currentSelection || currentSelection.revealedIds.includes(placeId)) return;
    persist({
      ...state,
      discoveries: recordRevealedDiscovery(state.discoveries, placeId, revealedAt),
      selection: {
        ...currentSelection,
        revealedIds: [...currentSelection.revealedIds, placeId],
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
      className="my-5 min-w-0 w-full rounded-card border border-line bg-surface p-4 shadow-[0_8px_30px_-24px_rgba(49,40,61,0.3)] sm:p-5"
    >
      <h2 id="daily-picks-heading" className="font-display text-2xl text-ink">
        {hasActivePicks ? "Today’s Fiyu Picks" : "Choose today’s preferences"}
      </h2>

      {snapshot === null || finding ? (
        <div
          role="status"
          className="mt-4 flex min-h-36 flex-col items-center justify-center text-center"
          data-testid="daily-picks-hydrating"
        >
          <CityLoadingSequence cityId={ACTIVE_FIYU_CITY.id} />
          <p className="mt-2 text-sm font-medium text-ink-muted">
            {finding ? "Finding today’s restaurants…" : "Loading today’s selection…"}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {hasActivePicks && currentSelection && (
            <div className="space-y-3" aria-label="Today’s restaurants">
              {selectedRestaurants.map((restaurant, index) => (
                <DailyCardFrame
                  key={restaurant.place_id}
                  placeId={restaurant.place_id}
                  selected={selectedPlaceId === restaurant.place_id}
                  registerRef={registerCardRef}
                >
                  <ConcealedRestaurantCard
                    restaurant={restaurant}
                    position={index + 1}
                    revealed={currentSelection.revealedIds.includes(restaurant.place_id)}
                    saved={state.savedRestaurantIds.includes(restaurant.place_id)}
                    onReveal={() => reveal(restaurant.place_id, Date.now())}
                    onToggleSaved={() => toggleSaved(restaurant.place_id)}
                    onOpen={onOpenRestaurant}
                  />
                </DailyCardFrame>
              ))}
            </div>
          )}

          {!hasActivePicks && (
            <div className="rounded-card border border-line bg-lavender-50/35 p-4 sm:p-5">
              <PreferenceControls preferences={state.preferences} onChange={updatePreferences} />
              {originSetup && !originSetup.origin ? (
                <div className="mt-5">
                  <FreeOriginOnboarding setup={originSetup} />
                </div>
              ) : (
                <Button
                  variant="primary"
                  onClick={generate}
                  className="mt-5 min-h-12 w-full px-6 text-sm sm:w-auto"
                >
                  Find today&apos;s restaurants
                </Button>
              )}
            </div>
          )}

          {hasActivePicks && currentSelection && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-ink-muted" aria-live="polite">
                Next selection available in{" "}
                {remainingLabel(Date.parse(currentSelection.expiresAt) - now)}
              </p>
            </div>
          )}

          {inventoryMessage && (
            <p role="status" className="text-xs text-ink-muted">
              {inventoryMessage}
            </p>
          )}

          <RecentDiscoveries
            discoveries={recent}
            restaurants={restaurants}
            savedRestaurantIds={state.savedRestaurantIds}
            now={now}
            onOpen={onOpenRestaurant}
            onToggleSaved={toggleSaved}
            selectedPlaceId={selectedPlaceId}
            registerCardRef={registerCardRef}
          />
        </div>
      )}
    </section>
  );
}

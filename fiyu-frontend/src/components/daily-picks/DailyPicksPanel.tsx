"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { ConcealedRestaurantCard } from "@/components/daily-picks/ConcealedRestaurantCard";
import { CityHeaderMark } from "@/components/city-signature/CitySignature";
import {
  DailyCardFrame,
  type DailyCardRefRegistrar,
} from "@/components/daily-picks/DailyCardFrame";
import { RecentDiscoveries } from "@/components/daily-picks/RecentDiscoveries";
import { FreeOriginOnboarding } from "@/components/location/FreeOriginOnboarding";
import { Button } from "@/components/ui/Button";
import { assignDailyPicks } from "@/lib/api/client";
import { FiyuApiError } from "@/lib/api/errors";
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
import { UNLIMITED_PICKS_DEV_MODE } from "@/lib/daily-picks/developmentMode";
import { isMappable } from "@/lib/geo/mappable";
import type { FreeOriginSetup } from "@/lib/location/origin";
import {
  publishNewlyRevealedMapPlaces,
  subscribeToNewlyRevealedMapPlaces,
} from "@/lib/map/revealEvents";
import {
  DAILY_PICKS_DURATION_MS,
  EMPTY_DAILY_PICKS_STATE,
  browserDailyPicksStorage,
  createDailySelection,
  selectionIsActive,
  type DailyPicksState,
  type DailyPicksStorage,
} from "@/lib/daily-picks/storage";
import { useDefaultList } from "@/lib/lists/useDefaultList";
import { getOrCreateAnonymousOwnerKey } from "@/lib/lists/identity";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";

export interface DailyPicksPanelProps {
  restaurants: PublicRestaurant[];
  activeArea?: string | null;
  storage?: DailyPicksStorage;
  onOpenRestaurant?: (restaurant: PublicRestaurant) => void;
  onViewRestaurant?: (restaurant: PublicRestaurant) => void;
  onVisibleRestaurantIdsChange?: (restaurantIds: string[]) => void;
  selectedPlaceId?: string | null;
  scrollToPlaceId?: string | null;
  scrollRequestKey?: number;
  originSetup?: FreeOriginSetup;
}

/**
 * How long the discovery sequence stays on screen after the user asks for picks.
 *
 * This is a floor on the presentation, not a delay bolted onto the work.
 * Selection is synchronous over the already-fetched catalogue and the result is
 * persisted the instant the button is pressed, so the work and this timer run
 * alongside each other -- the equivalent of awaiting both together. Nothing is
 * waiting on a network call that this could be shortening.
 *
 * The request and this short presentation floor run concurrently.
 */
const DISCOVERY_MIN_VISIBLE_MS = 650;

/** The tail of that window, during which the loading state fades out. */
const DISCOVERY_SETTLE_MS = 160;

/** `settling` is the fade; picks mount when the phase returns to `idle`. */
type DiscoveryPhase = "idle" | "finding" | "settling";

function InkDotWave() {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  return (
    <span
      aria-hidden="true"
      data-testid="daily-picks-dot-loader"
      data-motion={reducedMotion ? "static" : "wave"}
      className="inline-flex h-5 items-end gap-2"
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          data-testid="daily-picks-loader-dot"
          className={reducedMotion ? "size-2 rounded-[54%_46%_52%_48%] bg-plum" : "fiyu-ink-dot size-2 bg-plum"}
          style={reducedMotion ? undefined : { animationDelay: `${index * 140}ms` }}
        />
      ))}
    </span>
  );
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
        <legend className="flex items-baseline gap-2 text-sm text-ink">
          <span className="text-[0.68rem] font-semibold tracking-[0.12em] text-lavender-700 uppercase">
            Step 1
          </span>
          <span className="font-medium text-ink">Food interests</span>
        </legend>
        <p className="mt-1 text-xs text-ink-muted">Choose up to three, or let Fiyu surprise you.</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
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
                    ? "inline-flex min-h-9 items-center rounded-lg border border-lavender-500 bg-lavender-100/65 px-3.5 text-sm font-medium text-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
                    : "inline-flex min-h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-sm text-ink-muted hover:border-lavender-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600 disabled:cursor-not-allowed disabled:opacity-40"
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
                ? "inline-flex min-h-9 items-center rounded-lg border border-plum bg-lavender-100/65 px-3.5 text-sm font-medium text-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum"
                : "inline-flex min-h-9 items-center rounded-lg border border-line bg-surface px-3.5 text-sm font-medium text-plum hover:border-plum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum"
            }
          >
            Surprise me
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend className="flex items-baseline gap-2 text-sm text-ink">
          <span className="text-[0.68rem] font-semibold tracking-[0.12em] text-lavender-700 uppercase">
            Step 2
          </span>
          <span className="font-medium text-ink">Non-Japanese restaurants</span>
        </legend>
        {/*
         * A grid, not inline-flex thirds: three `w-1/3` inline-level buttons
         * are separated by collapsible whitespace, so the row overran its
         * container and the selected fill broke across the wrap. Grid tracks
         * divide the width exactly and stretch every segment to one height.
         */}
        <div className="mt-2.5 grid min-w-0 grid-cols-1 overflow-hidden rounded-lg border border-line bg-surface sm:grid-cols-3">
          {([
            ["japanese-only", "Japanese only"],
            ["occasionally", "Mostly Japanese"],
            ["yes", "Open to anything"],
          ] as const satisfies readonly (readonly [NonJapanesePreference, string])[]).map(
            ([value, label], index) => {
              const selected = preferences.nonJapanese === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange({ ...preferences, nonJapanese: value })}
                  className={[
                    "flex min-h-11 min-w-0 items-center justify-center px-2.5 text-center text-sm leading-tight transition-colors sm:px-3",
                    // Inset ring: an offset outline would be clipped by the
                    // control's own overflow-hidden corners.
                    "focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lavender-600",
                    index > 0 ? "border-t border-line sm:border-t-0 sm:border-l" : "",
                    selected
                      ? "bg-lavender-100/65 font-medium text-plum"
                      : "text-ink-muted hover:bg-subtle",
                  ].join(" ")}
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

/**
 * Discovery context beneath the mobile `Picks` heading.
 *
 * Every value here comes from state that already exists: the count is the
 * current selection's length and the area is the resolved discovery origin.
 * Neither is invented -- with no active selection the count line is omitted
 * entirely, and with no resolved origin the area prefix simply disappears.
 *
 * A lightly tinted, compact context strip keeps this distinct from the heavier
 * restaurant cards while preserving the existing preference action.
 */
function PicksDiscoveryContext({
  areaLabel,
  pickCount,
  tuning,
  onToggleTuning,
}: {
  areaLabel: string | null;
  pickCount: number;
  tuning: boolean;
  onToggleTuning?: () => void;
}) {
  const countLabel = pickCount > 0 ? `${pickCount} picks selected for you today` : null;
  const headline =
    countLabel && areaLabel
      ? `Near ${areaLabel} · ${countLabel}`
      : (countLabel ?? (areaLabel ? `Near ${areaLabel}` : null));

  return (
    <div
      data-testid="picks-discovery-context"
      className="flex min-w-0 items-start justify-between gap-3 rounded-xl bg-lavender-50/55 px-3 py-3 lg:hidden"
    >
      <div className="min-w-0">
        {headline && (
          <p className="flex min-w-0 items-center gap-1.5 text-sm leading-5 font-semibold text-plum">
            <CityHeaderMark cityId={ACTIVE_FIYU_CITY.id} />
            <span className="truncate">{headline}</span>
          </p>
        )}
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          Based on your tastes and nearby area
        </p>
      </div>

      {onToggleTuning && (
        <button
          type="button"
          onClick={onToggleTuning}
          aria-expanded={tuning}
          aria-controls={tuning ? "picks-preference-tuning" : undefined}
          className="inline-flex min-h-9 shrink-0 items-center rounded-chip border border-lavender-100 bg-white/55 px-3 text-xs font-medium text-lavender-700 transition-colors duration-200 ease-(--ease-fiyu) hover:border-lavender-600 hover:bg-white"
        >
          Edit preferences
        </button>
      )}
    </div>
  );
}

export function DailyPicksPanel({
  restaurants,
  activeArea = null,
  storage: injectedStorage,
  onOpenRestaurant,
  onViewRestaurant,
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
  const defaultList = useDefaultList(ACTIVE_FIYU_CITY.id, { enabled: injectedStorage === undefined });
  const [inventoryMessage, setInventoryMessage] = useState<string | null>(null);
  const [phase, setPhase] = useState<DiscoveryPhase>("idle");
  const [tuning, setTuning] = useState(false);
  const [newMapPlaceCount, setNewMapPlaceCount] = useState(0);
  const findingTimerRef = useRef<number | null>(null);
  const mapNoticeTimerRef = useRef<number | null>(null);
  const developmentGenerationRef = useRef(0);
  const assignmentGenerationRef = useRef(0);
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
        ...(currentSelection?.revealedIds ?? []),
        ...recent.map((discovery) => discovery.restaurantId),
      ])].sort(),
    [currentSelection?.revealedIds, recent],
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
      assignmentGenerationRef.current += 1;
      if (findingTimerRef.current !== null) window.clearTimeout(findingTimerRef.current);
      if (mapNoticeTimerRef.current !== null) window.clearTimeout(mapNoticeTimerRef.current);
    },
    [],
  );

  useEffect(
    () =>
      subscribeToNewlyRevealedMapPlaces((event) => {
        setNewMapPlaceCount(event.placeIds.length);
        if (mapNoticeTimerRef.current !== null) {
          window.clearTimeout(mapNoticeTimerRef.current);
        }
        mapNoticeTimerRef.current = window.setTimeout(() => {
          setNewMapPlaceCount(0);
          mapNoticeTimerRef.current = null;
        }, 3_200);
      }),
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

  const finishDiscovery = (generation: number) => {
    if (generation !== assignmentGenerationRef.current) return;
    setPhase("settling");
    findingTimerRef.current = window.setTimeout(() => {
      if (generation !== assignmentGenerationRef.current) return;
      setPhase("idle");
      findingTimerRef.current = null;
    }, DISCOVERY_SETTLE_MS);
  };

  const generate = (developmentRefresh = false) => {
    const generatedAt = Date.now();
    const useDevelopmentRefresh = UNLIMITED_PICKS_DEV_MODE && developmentRefresh;
    const generation = assignmentGenerationRef.current + 1;
    assignmentGenerationRef.current = generation;
    const legacyServedIds = [
      ...new Set([
        ...(state.servedRestaurantIds ?? []),
        ...(state.selection?.restaurantIds ?? []),
        ...state.discoveries.map((discovery) => discovery.restaurantId),
      ]),
    ];

    setInventoryMessage(null);
    setPhase("finding");

    if (injectedStorage === undefined && !useDevelopmentRefresh) {
      const assignment = assignDailyPicks(
        {
          city_id: ACTIVE_FIYU_CITY.id,
          candidate_place_ids: restaurants.map((restaurant) => restaurant.place_id),
          legacy_served_place_ids: legacyServedIds,
          categories: state.preferences.categories,
          non_japanese: state.preferences.nonJapanese,
          active_area: activeArea,
          seed: Math.floor(generatedAt / DAILY_PICKS_DURATION_MS),
          requested_count: 3,
        },
        { clientId: getOrCreateAnonymousOwnerKey() },
      );
      const minimum = new Promise<void>((resolve) => {
        findingTimerRef.current = window.setTimeout(
          resolve,
          DISCOVERY_MIN_VISIBLE_MS - DISCOVERY_SETTLE_MS,
        );
      });
      void Promise.allSettled([assignment, minimum]).then(([result]) => {
        if (generation !== assignmentGenerationRef.current) return;
        if (result.status === "rejected") {
          setInventoryMessage(
            result.reason instanceof FiyuApiError && result.reason.status === 409
              ? "You’ve discovered every currently available restaurant."
              : "Could not find today’s restaurants. Try again in a moment.",
          );
          finishDiscovery(generation);
          return;
        }
        const assignedAt = Date.parse(result.value.assigned_at);
        persist({
          ...state,
          version: 3,
          servedRestaurantIds: [...new Set([...legacyServedIds, ...result.value.place_ids])],
          selection: createDailySelection(
            result.value.place_ids,
            Number.isFinite(assignedAt) ? assignedAt : generatedAt,
          ),
        });
        finishDiscovery(generation);
      });
      return;
    }

    const currentIds = new Set(currentSelection?.restaurantIds ?? []);
    const servedIds = new Set(useDevelopmentRefresh ? currentIds : legacyServedIds);
    const freshRestaurants = restaurants.filter(
      (restaurant) => !servedIds.has(restaurant.place_id),
    );
    const developmentSeed = generatedAt + developmentGenerationRef.current;
    if (useDevelopmentRefresh) developmentGenerationRef.current += 1;
    const options = {
      activeArea,
      seed: useDevelopmentRefresh
        ? developmentSeed
        : Math.floor(generatedAt / DAILY_PICKS_DURATION_MS),
    };
    let picks = selectDailyRestaurants(freshRestaurants, state.preferences, options);
    if (useDevelopmentRefresh && picks.length !== 3) {
      picks = selectDailyRestaurants(restaurants, state.preferences, options);
    }
    if (picks.length !== 3) {
      setInventoryMessage("Not enough matching restaurants are available yet.");
      setPhase("idle");
      return;
    }
    const pickIds = picks.map((restaurant) => restaurant.place_id);
    persist({
      ...state,
      version: 3,
      servedRestaurantIds: [...new Set([...legacyServedIds, ...pickIds])],
      selection: createDailySelection(pickIds, generatedAt),
    });
    findingTimerRef.current = window.setTimeout(() => {
      finishDiscovery(generation);
    }, DISCOVERY_MIN_VISIBLE_MS - DISCOVERY_SETTLE_MS);
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
    const restaurant = restaurants.find((candidate) => candidate.place_id === placeId);
    if (restaurant && isMappable(restaurant)) {
      publishNewlyRevealedMapPlaces(
        [placeId],
        revealedAt,
        [
          ...currentSelection.revealedIds,
          placeId,
          ...recent.map((discovery) => discovery.restaurantId),
        ],
      );
    }
  };

  const savedRestaurantIds =
    injectedStorage === undefined && defaultList.status !== "error"
      ? defaultList.savedPlaceIds
      : state.savedRestaurantIds;

  const toggleSaved = (placeId: string) => {
    if (defaultList.pendingPlaceIds.includes(placeId)) return;
    if (injectedStorage === undefined) {
      void defaultList.toggle(placeId);
      return;
    }
    const saved = state.savedRestaurantIds.includes(placeId);
    persist({
      ...state,
      savedRestaurantIds: saved
        ? state.savedRestaurantIds.filter((id) => id !== placeId)
        : [...state.savedRestaurantIds, placeId],
    });
  };

  return (
    <>
      {newMapPlaceCount > 0 && (
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="new-map-place-notification"
          className="fixed top-[calc(var(--spacing-header)+0.75rem)] right-4 z-50 max-w-[calc(100vw-2rem)] rounded-chip border border-lavender-100 bg-plum px-4 py-2.5 text-sm font-medium text-white"
        >
          {newMapPlaceCount === 1
            ? "1 new place added to your map"
            : `${newMapPlaceCount} new places added to your map`}
        </p>
      )}

      <PicksDiscoveryContext
        areaLabel={activeArea?.trim() ? activeArea.trim() : null}
        pickCount={hasActivePicks ? selectedRestaurants.length : 0}
        tuning={tuning}
        // Tuning is only offered while a selection is active: without one the
        // same controls are already the primary content of the panel below.
        onToggleTuning={hasActivePicks ? () => setTuning((open) => !open) : undefined}
      />

      {hasActivePicks && tuning && (
        <div
          id="picks-preference-tuning"
          className="mt-4 rounded-card border border-line bg-lavender-50/35 p-4 lg:hidden"
        >
          <PreferenceControls preferences={state.preferences} onChange={updatePreferences} />
          <p className="mt-4 text-xs leading-5 text-ink-muted">
            Saved for your next picks. Today&apos;s selection stays as it is.
          </p>
        </div>
      )}

      <section
        aria-labelledby="daily-picks-heading"
        className="my-5 min-w-0 w-full rounded-card border border-line bg-surface p-4 shadow-[0_8px_30px_-24px_rgba(49,40,61,0.3)] sm:p-5"
      >
        <h2 id="daily-picks-heading" className="font-display text-2xl text-ink">
          {hasActivePicks ? "Today’s Fiyu Picks" : "Choose today’s preferences"}
        </h2>

        {snapshot === null || phase !== "idle" ? (
          <div
            role="status"
            className="mt-4 flex min-h-36 flex-col items-center justify-center text-center"
            data-testid="daily-picks-hydrating"
            data-discovery-phase={phase}
            style={
              phase === "settling"
                ? { animation: `fiyu-fade-out ${DISCOVERY_SETTLE_MS}ms var(--ease-fiyu) forwards` }
                : undefined
            }
          >
            <InkDotWave />
            <p className="mt-2 text-sm font-medium text-ink-muted">
              {phase === "idle" ? "Loading today’s selection…" : "Finding today’s restaurants…"}
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {hasActivePicks && currentSelection && (
              <div
                className="space-y-4"
                aria-label="Today’s restaurants"
                style={{ animation: "fiyu-fade-in 260ms var(--ease-fiyu)" }}
              >
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
                      saved={savedRestaurantIds.includes(restaurant.place_id)}
                      savePending={defaultList.pendingPlaceIds.includes(restaurant.place_id)}
                      onReveal={() => reveal(restaurant.place_id, Date.now())}
                      onToggleSaved={() => toggleSaved(restaurant.place_id)}
                      onOpen={onOpenRestaurant}
                      onViewDetails={onViewRestaurant}
                    />
                  </DailyCardFrame>
                ))}
              </div>
            )}

            {!hasActivePicks && (
              <div className="space-y-4 px-0.5 sm:space-y-5">
                <div className="rounded-card border border-lavender-100/85 bg-surface px-4 py-4 sm:px-5 sm:py-4.5">
                  <PreferenceControls preferences={state.preferences} onChange={updatePreferences} />
                </div>

                {originSetup && !originSetup.origin ? (
                  <div className="rounded-xl border border-lavender-100/75 bg-surface px-4 py-3.5 sm:px-5 sm:py-4">
                    <FreeOriginOnboarding setup={originSetup} />
                  </div>
                ) : null}

                {/*
                 * The primary action closes the flow in every state. It used to
                 * be withheld while the origin card was open, which read as the
                 * button having vanished; setting an origin shapes the
                 * selection but has never been required to make one.
                 */}
                <div className="pt-0.5">
                  <Button
                    variant="primary"
                    onClick={() => generate()}
                    className="min-h-12 w-full px-6 text-sm sm:w-auto"
                  >
                    Find today&apos;s restaurants
                  </Button>
                </div>
              </div>
            )}

            {hasActivePicks && currentSelection && (
              UNLIMITED_PICKS_DEV_MODE ? (
                <div
                  data-testid="unlimited-picks-dev-controls"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-lavender-100 bg-lavender-50/35 p-3"
                >
                  <p className="text-xs font-medium text-lavender-700">Development testing mode</p>
                  <Button size="sm" variant="secondary" onClick={() => generate(true)}>
                    Generate another test set
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs text-ink-muted" aria-live="polite">
                    Next selection available in{" "}
                    {remainingLabel(Date.parse(currentSelection.expiresAt) - now)}
                  </p>
                </div>
              )
            )}

            {inventoryMessage && (
              <p role="status" className="text-xs text-ink-muted">
                {inventoryMessage}
              </p>
            )}

            {defaultList.operationError && (
              <p role="status" className="text-xs text-dusty-rose">
                {defaultList.operationError}
              </p>
            )}

          </div>
        )}
      </section>

      {/*
       * Recent Discoveries is its own section on the page background, not a
       * panel inside the preferences card. The rule that used to stand in for
       * this separation sat inside the same box, so the preference flow and the
       * discovery history still read as one object.
       */}
      {snapshot !== null && phase === "idle" && (
        <div className="mt-6 min-w-0 w-full sm:mt-8">
          <RecentDiscoveries
            discoveries={recent}
            restaurants={restaurants}
            savedRestaurantIds={savedRestaurantIds}
            pendingPlaceIds={defaultList.pendingPlaceIds}
            now={now}
            onOpen={onOpenRestaurant}
            onViewDetails={onViewRestaurant}
            onToggleSaved={toggleSaved}
            selectedPlaceId={selectedPlaceId}
            registerCardRef={registerCardRef}
          />
        </div>
      )}
    </>
  );
}

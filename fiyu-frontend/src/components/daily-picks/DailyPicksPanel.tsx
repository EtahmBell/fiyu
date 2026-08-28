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
import { FiyuLoadingScreen } from "@/components/states/FiyuLoadingScreen";
import { Button } from "@/components/ui/Button";
import {
  assignDailyPicks,
  fetchActiveDailyPicks,
  fetchRecentDailyPicks,
  revealDailyPicks,
} from "@/lib/api/client";
import {
  accountQueryKey,
  loadAccountQuery,
  readAccountQuery,
  writeAccountQuery,
} from "@/lib/accountQueryCache";
import { FiyuApiError } from "@/lib/api/errors";
import type { PublicRestaurant } from "@/lib/api/schemas";
import { ACTIVE_FIYU_CITY } from "@/lib/city/editions";
import {
  selectDailyRestaurants,
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
  /** Authenticated UUID used only to isolate the browser cache by account. */
  accountId?: string | null;
  activeDiscoveryLocation?: ActivePicksDiscoveryLocation | null;
  storage?: DailyPicksStorage;
  onOpenRestaurant?: (restaurant: PublicRestaurant) => void;
  onViewRestaurant?: (restaurant: PublicRestaurant) => void;
  onVisibleRestaurantsChange?: (restaurants: PublicRestaurant[]) => void;
  selectedPlaceId?: string | null;
  scrollToPlaceId?: string | null;
  scrollRequestKey?: number;
  originSetup?: FreeOriginSetup;
}

export interface ActivePicksDiscoveryLocation {
  mode: "current" | "preview" | "manual" | null;
  label: string | null;
  latitude: number | null;
  longitude: number | null;
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
export const FRESH_PICKS_MIN_VISIBLE_MS = 1_500;

type DiscoveryPhase = "idle" | "finding";
type ActiveAssignmentState = {
  accountId: string | null;
  status: "idle" | "ready" | "error";
};

type AssignmentDiscoveryLocation = {
  accountId: string | null;
  roundId: string;
  mode: ActivePicksDiscoveryLocation["mode"];
  label: string | null;
};

type DailyPicksHydration = {
  assignment: Awaited<ReturnType<typeof fetchActiveDailyPicks>>;
  recentRounds: Awaited<ReturnType<typeof fetchRecentDailyPicks>>;
};

function freshSearchLabel(location: ActivePicksDiscoveryLocation | null): string {
  if (location?.mode === "current") return "Searching near you";
  if (location?.mode === "preview" || location?.mode === "manual") {
    const label = location.label?.trim();
    if (label) return `Searching near ${label}`;
  }
  return "Searching nearby";
}

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

/**
 * Discovery context beneath the mobile `Picks` heading.
 *
 * Every value here comes from state that already exists: the count is the
 * current selection's length and the area is the resolved discovery origin.
 * Neither is invented -- with no active selection the count line is omitted
 * entirely, and with no resolved origin the area prefix simply disappears.
 *
 * A lightly tinted, compact context strip keeps this distinct from the heavier
 * restaurant cards.
 */
function PicksDiscoveryContext({
  areaLabel,
  pickCount,
}: {
  areaLabel: string | null;
  pickCount: number;
}) {
  const countLabel = pickCount > 0 ? `${pickCount} picks selected` : null;
  const namedAreaLabel = areaLabel === "you" ? null : areaLabel;
  const headline =
    countLabel && namedAreaLabel
      ? `Near ${namedAreaLabel} · ${countLabel}`
      : (countLabel ?? (namedAreaLabel ? `Near ${namedAreaLabel}` : null));
  const contextLabel = namedAreaLabel
    ? `Selected near ${namedAreaLabel}`
    : "Selected near your current location";

  return (
    <div
      data-testid="picks-discovery-context"
      className="flex min-w-0 items-start justify-between gap-3 rounded-xl bg-lavender-50/55 px-3 py-3 lg:hidden"
    >
      <div className="min-w-0">
        {headline && (
          <p className="flex min-w-0 items-center gap-1.5 text-sm leading-5 font-semibold text-plum">
            <CityHeaderMark cityId={ACTIVE_FIYU_CITY.id} />
            <span className="min-w-0">{headline}</span>
          </p>
        )}
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          {contextLabel}
        </p>
      </div>

    </div>
  );
}

export function DailyPicksPanel({
  restaurants,
  accountId = null,
  activeDiscoveryLocation = null,
  storage: injectedStorage,
  onOpenRestaurant,
  onViewRestaurant,
  onVisibleRestaurantsChange,
  selectedPlaceId = null,
  scrollToPlaceId = null,
  scrollRequestKey = 0,
  originSetup,
}: DailyPicksPanelProps) {
  const browserStorage = useMemo(() => browserDailyPicksStorage(accountId), [accountId]);
  const storage = injectedStorage ?? browserStorage;
  const snapshot = useSyncExternalStore(
    storage.subscribe,
    storage.getSnapshot,
    storage.getServerSnapshot,
  );
  const now = useSyncExternalStore(subscribeClock, currentMinute, serverMinute);
  const defaultList = useDefaultList(ACTIVE_FIYU_CITY.id, {
    enabled: injectedStorage === undefined,
    accountId,
  });
  const hydrationKey = accountId ? accountQueryKey("daily-picks", accountId) : null;
  const cachedHydration = hydrationKey
    ? readAccountQuery<DailyPicksHydration>(hydrationKey)
    : undefined;
  const [inventoryMessage, setInventoryMessage] = useState<string | null>(null);
  const [phase, setPhase] = useState<DiscoveryPhase>("idle");
  const [searchLocation, setSearchLocation] = useState<ActivePicksDiscoveryLocation | null>(null);
  const [newMapPlaceCount, setNewMapPlaceCount] = useState(0);
  const [assignmentRestaurants, setAssignmentRestaurants] = useState<PublicRestaurant[]>(() => {
    if (!cachedHydration) return [];
    const restaurants = [
      ...(cachedHydration.assignment?.restaurants ?? []),
      ...cachedHydration.recentRounds.flatMap((round) => round.restaurants),
    ];
    return [...new Map(restaurants.map((restaurant) => [restaurant.place_id, restaurant])).values()];
  });
  const [assignmentAccountId, setAssignmentAccountId] = useState<string | null>(
    cachedHydration ? accountId : null,
  );
  const [assignmentLocation, setAssignmentLocation] = useState<AssignmentDiscoveryLocation | null>(
    cachedHydration?.assignment
      ? {
          accountId,
          roundId: cachedHydration.assignment.round_id,
          mode: cachedHydration.assignment.discovery_mode ?? null,
          label: cachedHydration.assignment.discovery_label?.trim() || null,
        }
      : null,
  );
  const [activeAssignmentState, setActiveAssignmentState] = useState<ActiveAssignmentState>({
    accountId: cachedHydration ? accountId : null,
    status: cachedHydration ? "ready" : "idle",
  });
  const findingTimerRef = useRef<number | null>(null);
  const mapNoticeTimerRef = useRef<number | null>(null);
  const developmentGenerationRef = useRef(0);
  const assignmentGenerationRef = useRef(0);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  const state = snapshot ?? EMPTY_DAILY_PICKS_STATE;
  const selection = snapshot?.selection ?? null;
  const active = selection ? selectionIsActive(selection, now) : false;
  const currentSelection = active ? selection : null;
  const restaurantById = useMemo(() => {
    const serverRestaurants = assignmentAccountId === accountId ? assignmentRestaurants : [];
    return new Map(
      [...restaurants, ...serverRestaurants].map((restaurant) => [restaurant.place_id, restaurant]),
    );
  }, [accountId, assignmentAccountId, assignmentRestaurants, restaurants]);
  const hydratedRestaurants = useMemo(() => [...restaurantById.values()], [restaurantById]);
  const selectedRestaurants = useMemo(() => {
    if (!currentSelection) return [];
    return currentSelection.restaurantIds
      .map((id) => restaurantById.get(id))
      .filter((restaurant): restaurant is PublicRestaurant => Boolean(restaurant));
  }, [currentSelection, restaurantById]);
  const hasActivePicks = active && selectedRestaurants.length > 0;
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
  const visibleRestaurants = useMemo(
    () => visibleRestaurantIds
      .map((placeId) => restaurantById.get(placeId))
      .filter((restaurant): restaurant is PublicRestaurant => Boolean(restaurant)),
    [restaurantById, visibleRestaurantIds],
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
    if (snapshot !== null) onVisibleRestaurantsChange?.(visibleRestaurants);
  }, [onVisibleRestaurantsChange, snapshot, visibleRestaurants]);

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
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (injectedStorage !== undefined || !accountId) return;
    let cancelled = false;
    const identity = { clientId: getOrCreateAnonymousOwnerKey() };
    const key = accountQueryKey("daily-picks", accountId);
    void loadAccountQuery<DailyPicksHydration>(key, async () => {
      const [assignment, recentRounds] = await Promise.all([
        fetchActiveDailyPicks(ACTIVE_FIYU_CITY.id, identity),
        fetchRecentDailyPicks(ACTIVE_FIYU_CITY.id, identity),
      ]);
      return { assignment, recentRounds };
    }).then(({ assignment, recentRounds }) => {
      if (cancelled) return;
      const recentRestaurants = recentRounds.flatMap((round) => round.restaurants);
      const activeRestaurants = assignment?.restaurants ?? [];
      setAssignmentRestaurants(
        [...new Map([...activeRestaurants, ...recentRestaurants].map((restaurant) => [
          restaurant.place_id,
          restaurant,
        ])).values()],
      );
      setAssignmentAccountId(accountId);
      const latestHistorical = new Map<string, { restaurantId: string; revealedAt: string }>();
      for (const round of recentRounds) {
        for (const restaurantId of round.place_ids) {
          if (!latestHistorical.has(restaurantId)) {
            latestHistorical.set(restaurantId, {
              restaurantId,
              revealedAt: round.assigned_at,
            });
          }
        }
      }
      const restoredSnapshot = snapshotRef.current;
      if (assignment) {
        setAssignmentLocation({
          accountId,
          roundId: assignment.round_id,
          mode: assignment.discovery_mode ?? null,
          label: assignment.discovery_label?.trim() || null,
        });
        const assignedAt = Date.parse(assignment.assigned_at);
        const expiresAt = Date.parse(assignment.expires_at ?? "");
        const persistedRevealedIds = assignment.revealed_place_ids ?? [];
        const serverRevealedIds = persistedRevealedIds.length > 0
          ? persistedRevealedIds
          : assignment.revealed_at
            ? assignment.place_ids
            : [];
        let activeDiscoveries = (restoredSnapshot?.discoveries ?? []).filter((discovery) =>
          assignment.place_ids.includes(discovery.restaurantId),
        );
        if (serverRevealedIds.length > 0) {
          const revealedAt = Date.parse(assignment.revealed_at ?? assignment.assigned_at);
          activeDiscoveries = serverRevealedIds.reduce(
            (discoveries, placeId) => recordRevealedDiscovery(
              discoveries,
              placeId,
              Number.isFinite(revealedAt) ? revealedAt : assignedAt,
            ),
            activeDiscoveries,
          );
        }
        persist({
          ...(restoredSnapshot ?? EMPTY_DAILY_PICKS_STATE),
          version: 3,
          discoveries: [...latestHistorical.values(), ...activeDiscoveries],
          selection: {
            restaurantIds: assignment.place_ids,
            revealedIds: assignment.place_ids.filter((id) => serverRevealedIds.includes(id)),
            generatedAt: new Date(assignedAt).toISOString(),
            expiresAt: Number.isFinite(expiresAt)
              ? new Date(expiresAt).toISOString()
              : new Date(assignedAt + DAILY_PICKS_DURATION_MS).toISOString(),
          },
        });
      } else {
        setAssignmentLocation(null);
        persist({
          ...(restoredSnapshot ?? EMPTY_DAILY_PICKS_STATE),
          version: 3,
          selection: null,
          discoveries: [...latestHistorical.values()],
        });
      }
      setActiveAssignmentState({ accountId, status: "ready" });
    }).catch(() => {
      if (!cancelled) setActiveAssignmentState({ accountId, status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, injectedStorage, persist]);

  const finishDiscovery = (generation: number) => {
    if (generation !== assignmentGenerationRef.current) return;
    setPhase("idle");
    setSearchLocation(null);
    findingTimerRef.current = null;
  };

  const generate = (developmentRefresh = false) => {
    // This timestamp is intentionally captured on the user action, not during render.
    // eslint-disable-next-line react-hooks/purity
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
    const requestLocation = activeDiscoveryLocation
      ? { ...activeDiscoveryLocation }
      : null;
    setSearchLocation(requestLocation);
    setPhase("finding");

    if (injectedStorage === undefined && !useDevelopmentRefresh) {
      const assignment = assignDailyPicks(
        {
          city_id: ACTIVE_FIYU_CITY.id,
          legacy_served_place_ids: accountId ? [] : legacyServedIds,
          categories: state.preferences.categories,
          non_japanese: state.preferences.nonJapanese,
          active_area: requestLocation?.label ?? null,
          location_mode: requestLocation?.mode ?? null,
          discovery_latitude: requestLocation?.latitude ?? null,
          discovery_longitude: requestLocation?.longitude ?? null,
          requested_count: 3,
        },
        { clientId: getOrCreateAnonymousOwnerKey() },
      );
      const minimum = new Promise<void>((resolve) => {
        findingTimerRef.current = window.setTimeout(
          resolve,
          FRESH_PICKS_MIN_VISIBLE_MS,
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
        setAssignmentRestaurants(result.value.restaurants ?? []);
        setAssignmentAccountId(accountId);
        if (hydrationKey) {
          const previous = readAccountQuery<DailyPicksHydration>(hydrationKey);
          writeAccountQuery(hydrationKey, {
            assignment: result.value,
            recentRounds: previous?.recentRounds ?? [],
          });
        }
        setAssignmentLocation({
          accountId,
          roundId: result.value.round_id,
          mode: result.value.discovery_mode ?? requestLocation?.mode ?? null,
          label: result.value.discovery_label?.trim() || requestLocation?.label?.trim() || null,
        });
        persist({
          ...state,
          version: 3,
          servedRestaurantIds: [...new Set([...legacyServedIds, ...result.value.place_ids])],
          selection: {
            ...createDailySelection(
              result.value.place_ids,
              Number.isFinite(assignedAt) ? assignedAt : generatedAt,
            ),
            expiresAt:
              result.value.expires_at ??
              new Date(
                (Number.isFinite(assignedAt) ? assignedAt : generatedAt) +
                  DAILY_PICKS_DURATION_MS,
              ).toISOString(),
          },
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
      activeArea: requestLocation?.label ?? null,
      discoveryPoint:
        requestLocation?.latitude !== null && requestLocation?.latitude !== undefined &&
        requestLocation.longitude !== null
          ? { latitude: requestLocation.latitude, longitude: requestLocation.longitude }
          : null,
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
      setSearchLocation(null);
      return;
    }
    const pickIds = picks.map((restaurant) => restaurant.place_id);
    persist({
      ...state,
      version: 3,
      servedRestaurantIds: [...new Set([...legacyServedIds, ...pickIds])],
      selection: createDailySelection(pickIds, generatedAt),
    });
    findingTimerRef.current = window.setTimeout(
      () => finishDiscovery(generation),
      FRESH_PICKS_MIN_VISIBLE_MS,
    );
  };

  const reveal = (placeId: string, revealedAt: number) => {
    if (!currentSelection || currentSelection.revealedIds.includes(placeId)) return;
    const previousState = state;
    const revealedPlaceIds = [...currentSelection.revealedIds, placeId];
    const discoveries = recordRevealedDiscovery(state.discoveries, placeId, revealedAt);
    persist({
      ...state,
      discoveries,
      selection: {
        ...currentSelection,
        revealedIds: revealedPlaceIds,
      },
    });
    const revealedRestaurant = restaurantById.get(placeId);
    const mappableRevealed = revealedRestaurant && isMappable(revealedRestaurant)
      ? [revealedRestaurant]
      : [];
    const publishMapReveal = () => {
      if (mappableRevealed.length === 0) return;
      if (accountId) {
        const mapKey = accountQueryKey("map-restaurants", accountId);
        const cachedMap = readAccountQuery<PublicRestaurant[]>(mapKey);
        if (cachedMap) {
          writeAccountQuery(mapKey, [
            ...new Map([...cachedMap, ...mappableRevealed].map((restaurant) => [
              restaurant.place_id,
              restaurant,
            ])).values(),
          ]);
        }
      }
      publishNewlyRevealedMapPlaces(
        mappableRevealed.map((restaurant) => restaurant.place_id),
        revealedAt,
        [
          ...revealedPlaceIds,
          ...recent.map((discovery) => discovery.restaurantId),
        ],
      );
    };
    const roundId = assignmentLocation?.accountId === accountId
      ? assignmentLocation.roundId
      : null;
    if (injectedStorage === undefined && roundId) {
      void revealDailyPicks(roundId, placeId, { clientId: getOrCreateAnonymousOwnerKey() })
        .then((result) => {
          publishMapReveal();
          if (hydrationKey) {
            const hydration = readAccountQuery<DailyPicksHydration>(hydrationKey);
            if (hydration?.assignment?.round_id === roundId) {
              writeAccountQuery(hydrationKey, {
                ...hydration,
                assignment: {
                  ...hydration.assignment,
                  revealed_at: result.revealed_at,
                  revealed_place_ids: result.revealed_place_ids,
                },
              });
            }
          }
        })
        .catch(() => {
          persist(previousState);
          setInventoryMessage("We couldn’t save the reveal. Try again.");
        });
    } else {
      publishMapReveal();
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

  const assignmentHydrating =
    injectedStorage === undefined &&
    Boolean(accountId) &&
    activeAssignmentState.accountId !== accountId;
  if (snapshot === null || assignmentHydrating) {
    return <FiyuLoadingScreen contained />;
  }
  if (
    injectedStorage === undefined &&
    accountId &&
    activeAssignmentState.accountId === accountId &&
    activeAssignmentState.status === "error" &&
    !hasActivePicks
  ) {
    return (
      <section role="alert" className="my-5 rounded-card border border-line bg-surface p-5">
        <h2 className="font-display text-2xl text-ink">We couldn&rsquo;t load today&rsquo;s Picks.</h2>
        <p className="mt-2 text-sm text-ink-muted">Try this page again in a moment.</p>
      </section>
    );
  }

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

      {hasActivePicks && (
        <PicksDiscoveryContext
          areaLabel={
            assignmentLocation?.accountId === accountId && assignmentLocation.mode === "current"
              ? "you"
              : assignmentLocation?.accountId === accountId && assignmentLocation.label
                ? assignmentLocation.label
                : activeDiscoveryLocation?.mode === "current"
                  ? "you"
                  : activeDiscoveryLocation?.label?.trim() || null
          }
          pickCount={selectedRestaurants.length}
        />
      )}

      <section
        aria-labelledby="daily-picks-heading"
        data-testid="daily-picks-section"
        className="my-5 min-w-0 w-full"
      >
        <h2
          id="daily-picks-heading"
          className={
            phase === "finding"
              ? "sr-only"
              : "border-b border-line pb-3 font-display text-2xl text-ink"
          }
        >
          {phase === "finding"
            ? "Fresh Picks"
            : "Today’s Fiyu Picks"}
        </h2>

        {phase === "finding" ? (
          <div
            role="status"
            aria-live="polite"
            className="flex min-h-64 flex-col items-center justify-center px-4 py-10 text-center"
            data-testid="fresh-picks-loading"
          >
            <p className="font-display text-3xl tracking-[-0.02em] text-ink">Fiyu</p>
            <p className="mt-8 font-display text-[clamp(1.75rem,5vw,2.4rem)] leading-tight text-ink">
              {freshSearchLabel(searchLocation)}
            </p>
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              Finding a few places worth knowing.
            </p>
            <span className="mt-7"><InkDotWave /></span>
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

            {active && selectedRestaurants.length === 0 && (
              <p role="status" className="py-4 text-sm leading-6 text-ink-muted">
                No eligible Picks are available for this selection right now.
              </p>
            )}

            {!active && (
              <div className="space-y-4 px-0.5 sm:space-y-5">
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
            restaurants={hydratedRestaurants}
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

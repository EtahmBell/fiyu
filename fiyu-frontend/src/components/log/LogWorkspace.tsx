"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { RestaurantPhoto } from "@/components/restaurant/RestaurantPhoto";
import { StarRatingInput } from "@/components/log/StarRatingInput";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  createRestaurantVisit,
  deleteRestaurantVisit,
  fetchRestaurantLog,
  fetchRestaurant,
  fetchSeenRestaurantIds,
  fetchUserFiyuSummary,
  updateRestaurantVisit,
} from "@/lib/api/client";
import {
  accountQueryKey,
  loadAccountQuery,
  readAccountQuery,
  useAccountQuery,
  writeAccountQuery,
} from "@/lib/accountQueryCache";
import { FiyuApiError } from "@/lib/api/errors";
import type {
  MapRestaurant,
  PublicRestaurant,
  RestaurantVisit,
  VisitRating,
  VisitReaction,
} from "@/lib/api/schemas";
import { useIsDesktop } from "@/lib/hooks/useMediaQuery";
import { getOrCreateAnonymousOwnerKey } from "@/lib/lists/identity";
import { useDefaultList } from "@/lib/lists/useDefaultList";
import { useProfileIdentity } from "@/lib/profile/profileIdentity";
import { restaurantMetadataParts } from "@/lib/restaurant/displayArea";

type LoadState = "loading" | "ready" | "error";

/** One month of entries, in the order the Log already holds them. */
type VisitMonth = { key: string; label: string; visits: RestaurantVisit[] };

/** Field labels are micro caps, so the serif headings stay the only display type. */
const FIELD_LABEL_CLASS =
  "text-[0.6875rem] font-semibold tracking-[0.12em] text-ink-faint uppercase";

/**
 * Field shell: a hairline box on the warm field rather than a raised control, so
 * the form reads as three quiet lines instead of three stacked panels.
 */
const FIELD_CLASS =
  "mt-2 min-h-12 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600";

const LEGACY_REACTION_OPTIONS: { value: VisitReaction; label: string }[] = [
  { value: "love_it", label: "Love it" },
  { value: "like_it", label: "Like it" },
  { value: "not_for_me", label: "Not for me" },
];

function reactionLabel(reaction: VisitReaction): string {
  return LEGACY_REACTION_OPTIONS.find((option) => option.value === reaction)?.label ?? reaction;
}

function starText(rating: number): string {
  return `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;
}

function todayInputValue(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function visitTimestamp(date: string): string {
  return `${date}T12:00:00.000Z`;
}

function formatVisitDate(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

/** Month spine above a run of entries: "August 2026". */
function formatVisitMonth(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

/**
 * Entry dateline: weekday and day only. The month and year are already carried
 * by the heading above, so each entry needs just enough to be scanned.
 */
function formatVisitDay(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function newestFirst(visits: RestaurantVisit[]): RestaurantVisit[] {
  return [...visits].sort((left, right) => right.visited_at.localeCompare(left.visited_at));
}

/**
 * Presentation-only grouping. The visits are already newest-first, so adjacent
 * entries sharing a `YYYY-MM` prefix fall into the same run without sorting or
 * reordering anything.
 */
function groupByMonth(visits: RestaurantVisit[]): VisitMonth[] {
  const months: VisitMonth[] = [];
  for (const visit of visits) {
    const key = visit.visited_at.slice(0, 7);
    const open = months[months.length - 1];
    if (open && open.key === key) {
      open.visits.push(visit);
      continue;
    }
    months.push({ key, label: formatVisitMonth(visit.visited_at), visits: [visit] });
  }
  return months;
}

function countLabel(total: number): string {
  return `${total} ${total === 1 ? "visit" : "visits"}`;
}

function restaurantLabel(restaurant: PublicRestaurant): string {
  const nameJa = restaurant.name_ja?.trim();
  const nameEn = restaurant.name_en?.trim();
  if (nameJa && nameEn && nameJa !== nameEn) return `${nameJa} — ${nameEn}`;
  return nameJa || nameEn || restaurant.place_id;
}

function normalizedRestaurantName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

function restaurantMatches(restaurant: PublicRestaurant, query: string): boolean {
  const normalizedQuery = normalizedRestaurantName(query.trim());
  if (!normalizedQuery) return false;
  return [restaurant.name_en, restaurant.name_ja].some((name) =>
    normalizedRestaurantName(name ?? "").includes(normalizedQuery),
  );
}

export function LogWorkspace({
  mobileMode = "form",
}: {
  mobileMode?: "form" | "history";
}) {
  const isDesktop = useIsDesktop();
  const identity = useProfileIdentity();
  const accountId = identity.status === "loading" ? undefined : identity.profile?.user_id ?? null;
  const requestVisits = useCallback(
    () => fetchRestaurantLog({ clientId: getOrCreateAnonymousOwnerKey() }).then(newestFirst),
    [],
  );
  const visitsQuery = useAccountQuery<RestaurantVisit[]>({
    resource: "restaurant-log",
    accountId,
    loader: requestVisits,
  });
  const loadState: LoadState = visitsQuery.status ?? "loading";
  const visits = useMemo(() => visitsQuery.data ?? [], [visitsQuery.data]);
  const refreshVisits = visitsQuery.refresh;
  const setVisits = visitsQuery.setData;
  const defaultList = useDefaultList("tokyo", {
    accountId: accountId ?? null,
    enabled: accountId !== undefined,
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingVisit, setEditingVisit] = useState<RestaurantVisit | null>(null);
  const [catalog, setCatalog] = useState<PublicRestaurant[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState("");
  const [restaurantQuery, setRestaurantQuery] = useState("");
  const [restaurantSearchOpen, setRestaurantSearchOpen] = useState(false);
  const [activeRestaurantIndex, setActiveRestaurantIndex] = useState(-1);
  const [visitDate, setVisitDate] = useState(todayInputValue);
  const [rating, setRating] = useState<VisitRating | null>(null);
  const [privateNote, setPrivateNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saveConfirmation, setSaveConfirmation] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const savedPlaceIds = defaultList.savedPlaceIds;
  const loggedPlaceIdKey = useMemo(
    () => [...new Set(visits.map((visit) => visit.place_id))].sort().join("\u0000"),
    [visits],
  );
  const savedPlaceIdKey = useMemo(
    () => [...new Set(savedPlaceIds)].sort().join("\u0000"),
    [savedPlaceIds],
  );
  const matchingRestaurants = useMemo(
    () =>
      restaurantQuery.trim()
        ? catalog
            .filter((restaurant) => restaurantMatches(restaurant, restaurantQuery))
            .slice(0, 7)
        : catalog.slice(0, 7),
    [catalog, restaurantQuery],
  );

  const loadVisits = useCallback(async () => {
    setLoadError(null);
    try {
      await refreshVisits(true);
    } catch (cause) {
      const message = cause instanceof FiyuApiError ? cause.detail : null;
      setLoadError(message ?? "We couldn’t load your Log.");
    }
  }, [refreshVisits]);

  useEffect(() => {
    if ((isDesktop && !sheetOpen) || editingVisit) {
      return;
    }
    let cancelled = false;
    const loggedPlaceIds = new Set(loggedPlaceIdKey ? loggedPlaceIdKey.split("\u0000") : []);
    const stableSavedPlaceIds = savedPlaceIdKey ? savedPlaceIdKey.split("\u0000") : [];
    Promise.resolve()
      .then(() => {
        if (cancelled) return [];
        setCatalogLoading(true);
        setCatalogError(null);
        return fetchSeenRestaurantIds({ clientId: getOrCreateAnonymousOwnerKey() });
      })
      .then((seenPlaceIds) => {
        const eligiblePlaceIds = [
          ...new Set([...seenPlaceIds, ...stableSavedPlaceIds]),
        ].filter((candidate) => !loggedPlaceIds.has(candidate));
        return Promise.allSettled(
          eligiblePlaceIds.map((eligiblePlaceId) => fetchRestaurant(eligiblePlaceId)),
        ).then((results) => ({ results, eligiblePlaceIds }));
      })
      .then(({ results, eligiblePlaceIds }) => {
        if (cancelled) return;
        const loaded = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        setCatalog(loaded);
        if (eligiblePlaceIds.length > 0 && loaded.length === 0) {
          setCatalogError("We couldn’t load your available restaurants.");
        }
      })
      .catch(() => {
        if (!cancelled) setCatalogError("We couldn’t load the restaurant list.");
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    editingVisit,
    isDesktop,
    loggedPlaceIdKey,
    savedPlaceIdKey,
    sheetOpen,
  ]);

  const refreshYourFiyu = useCallback(async () => {
    if (!accountId) return;
    await loadAccountQuery(
      accountQueryKey("user-fiyu-summary", accountId),
      () => fetchUserFiyuSummary(),
      { force: true },
    ).catch(() => undefined);
  }, [accountId]);

  const openCreate = () => {
    setEditingVisit(null);
    setPlaceId("");
    setRestaurantQuery("");
    setRestaurantSearchOpen(false);
    setActiveRestaurantIndex(-1);
    setVisitDate(todayInputValue());
    setRating(null);
    setPrivateNote("");
    setFormError(null);
    setSaveConfirmation(false);
    setValidationAttempted(false);
    setSheetOpen(true);
  };

  const openEdit = (visit: RestaurantVisit) => {
    setEditingVisit(visit);
    setPlaceId(visit.place_id);
    setVisitDate(visit.visited_at.slice(0, 10));
    setRating(visit.rating as VisitRating | null);
    setPrivateNote(visit.private_note ?? "");
    setFormError(null);
    setSaveConfirmation(false);
    setValidationAttempted(false);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    if (saving) return;
    setSheetOpen(false);
    setEditingVisit(null);
    setRestaurantSearchOpen(false);
    setFormError(null);
  };

  const selectRestaurant = (restaurant: PublicRestaurant) => {
    setPlaceId(restaurant.place_id);
    setRestaurantQuery(restaurantLabel(restaurant));
    setRestaurantSearchOpen(false);
    setActiveRestaurantIndex(-1);
  };

  const saveVisit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationAttempted(true);
    if (!placeId || !visitDate || (!editingVisit && rating === null)) return;
    setSaving(true);
    setFormError(null);
    try {
      const note = privateNote.trim() || null;
      if (editingVisit) {
        const updated = await updateRestaurantVisit(
          editingVisit.id,
          {
            visited_at: visitTimestamp(visitDate),
            ...(rating === null ? {} : { rating }),
            private_note: note,
          },
          { clientId: getOrCreateAnonymousOwnerKey() },
        );
        setVisits((current = []) =>
          newestFirst(current.map((visit) => (visit.id === updated.id ? updated : visit))),
        );
      } else {
        const created = await createRestaurantVisit(
          { place_id: placeId, visited_at: visitTimestamp(visitDate), rating: rating!, private_note: note },
          { clientId: getOrCreateAnonymousOwnerKey() },
        );
        setVisits((current = []) => newestFirst([created, ...current]));
        setCatalog((current) => current.filter((restaurant) => restaurant.place_id !== placeId));
      }
      if (accountId && rating !== null) {
        const mapKey = accountQueryKey("map-restaurants", accountId);
        const cached = readAccountQuery<MapRestaurant[]>(mapKey);
        const selectedRestaurant = catalog.find((restaurant) => restaurant.place_id === placeId);
        {
          const current = cached ?? [];
          const next = current.some((restaurant) => restaurant.place_id === placeId)
            ? current.map((restaurant) =>
                restaurant.place_id === placeId
                  ? { ...restaurant, is_visited: true, user_rating: rating }
                  : restaurant,
              )
            : selectedRestaurant
              ? [...current, { ...selectedRestaurant, is_visited: true, user_rating: rating }]
              : current;
          writeAccountQuery(mapKey, next);
        }
      }
      await refreshYourFiyu();
      if (isDesktop) {
        setSheetOpen(false);
        setEditingVisit(null);
      } else {
        setEditingVisit(null);
        setPlaceId("");
        setRestaurantQuery("");
        setRestaurantSearchOpen(false);
        setActiveRestaurantIndex(-1);
        setVisitDate(todayInputValue());
        setRating(null);
        setPrivateNote("");
        setSaveConfirmation(true);
        setValidationAttempted(false);
      }
    } catch (cause) {
      const message = cause instanceof FiyuApiError ? cause.detail : null;
      setFormError(message ?? "We couldn’t save this visit.");
    } finally {
      setSaving(false);
    }
  };

  const removeVisit = async (visit: RestaurantVisit) => {
    if (!window.confirm(`Delete this visit to ${visit.restaurant.name_en ?? "the restaurant"}?`)) {
      return;
    }
    setDeletingId(visit.id);
    setLoadError(null);
    try {
      await deleteRestaurantVisit(visit.id, { clientId: getOrCreateAnonymousOwnerKey() });
      setVisits((current = []) =>
        current.filter((candidate) => candidate.id !== visit.id),
      );
      await refreshYourFiyu();
    } catch (cause) {
      const message = cause instanceof FiyuApiError ? cause.detail : null;
      setLoadError(message ?? "We couldn’t delete this visit.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      {isDesktop && (loadState === "loading" ? (
        <div className="py-12 text-center" role="status">
          <p className="text-sm text-ink-muted">Loading your Log…</p>
        </div>
      ) : loadState === "error" ? (
        <section
          role="alert"
          className="max-w-md rounded-card border border-line bg-surface p-4 sm:p-5"
        >
          <h2 className="font-display text-2xl leading-tight text-ink">
            We couldn’t load your Log.
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            {loadError ?? "We couldn’t load your Log."}
          </p>
          <Button className="mt-4" onClick={() => void loadVisits()}>
            Retry
          </Button>
        </section>
      ) : visits.length === 0 ? (
        <LogEmptyState onCreate={openCreate} />
      ) : (
        <section aria-label="Restaurant visits">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <p className="text-xs font-medium tracking-[0.1em] text-gold-700 uppercase">
              {countLabel(visits.length)} logged
            </p>
            <Button variant="secondary" onClick={openCreate}>
              Log a visit
            </Button>
          </div>
          {loadError && (
            <p role="alert" className="mb-4 text-sm text-rose-dust">
              {loadError}
            </p>
          )}
          {/*
           * Grouped by month so the page reads as a journal rather than a feed:
           * the month carries the year, each entry carries only its own day.
           */}
          <VisitHistorySections
            visits={visits}
            deletingId={deletingId}
            onEdit={openEdit}
            onDelete={(visit) => void removeVisit(visit)}
          />
        </section>
      ))}

      <Sheet
        open={sheetOpen || !isDesktop}
        onClose={isDesktop ? closeSheet : () => undefined}
        title={!isDesktop && mobileMode === "history" ? "Visit history" : editingVisit ? "Edit visit" : "Log a visit"}
        inlineOnMobile
      >
        {!isDesktop && mobileMode === "history" ? (
          <MobileVisitHistory
            loadState={loadState}
            loadError={loadError}
            visits={visits}
            deletingId={deletingId}
            onRetry={() => void loadVisits()}
            onEdit={openEdit}
            onDelete={(visit) => void removeVisit(visit)}
          />
        ) : (
        <form onSubmit={saveVisit} className="flex min-h-full flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-lavender-700 uppercase">
                {isDesktop ? (editingVisit ? "Edit entry" : "New entry") : "Tokyo edition"}
              </p>
              <h2 className="mt-1.5 font-display text-2xl leading-tight text-ink">
                {editingVisit ? "Edit visit" : "Log a visit"}
              </h2>
            </div>
            {isDesktop ? (
              <button
                type="button"
                onClick={closeSheet}
                aria-label="Close"
                className="-mr-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-xl leading-none text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
              >
                ×
              </button>
            ) : (
              <Link
                href="/log/history"
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-plum transition-colors hover:bg-subtle"
              >
                <HistoryGlyph />
                <span>History</span>
              </Link>
            )}
          </header>

          <div className="flex-1 space-y-6 px-5 py-6 sm:px-6">
            {saveConfirmation && (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-l-lavender-600 bg-lavender-50 px-3 py-2.5 text-sm text-ink"
              >
                <span>Visit saved.</span>
                <Link
                  href="/log/history"
                  className="min-h-9 font-semibold text-plum underline decoration-transparent underline-offset-4 hover:decoration-lavender-500"
                >
                  View in history
                </Link>
              </div>
            )}
            <div>
              {editingVisit ? (
                <>
                  <p className={FIELD_LABEL_CLASS}>Restaurant</p>
                  <p
                    lang={editingVisit.restaurant.name_ja ? "ja" : "en"}
                    className="mt-2 font-display text-xl leading-tight text-ink"
                  >
                    {editingVisit.restaurant.name_ja ??
                      editingVisit.restaurant.name_en ??
                      editingVisit.place_id}
                  </p>
                </>
              ) : (
                <>
                  <label htmlFor="log-visit-restaurant" className={`block ${FIELD_LABEL_CLASS}`}>
                    Restaurant
                  </label>
                  {catalogLoading ? (
                    <Skeleton className="mt-2 h-12 w-full rounded-lg" />
                  ) : (
                    <div
                      className="relative"
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                          setRestaurantSearchOpen(false);
                        }
                      }}
                    >
                      <input
                        id="log-visit-restaurant"
                        role="combobox"
                        type="search"
                        autoComplete="off"
                        placeholder="Search places you've seen"
                        value={restaurantQuery}
                        disabled={Boolean(catalogError)}
                        aria-autocomplete="list"
                        aria-expanded={restaurantSearchOpen}
                        aria-controls="log-visit-restaurant-results"
                        aria-activedescendant={
                          restaurantSearchOpen && activeRestaurantIndex >= 0
                            ? `log-visit-restaurant-option-${activeRestaurantIndex}`
                            : undefined
                        }
                        onFocus={(event) => {
                          setRestaurantSearchOpen(true);
                          if (placeId) event.currentTarget.select();
                        }}
                        onChange={(event) => {
                          setRestaurantQuery(event.target.value);
                          setPlaceId("");
                          setActiveRestaurantIndex(-1);
                          setRestaurantSearchOpen(true);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            setRestaurantSearchOpen(false);
                            return;
                          }
                          if (matchingRestaurants.length === 0) return;
                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setRestaurantSearchOpen(true);
                            setActiveRestaurantIndex((index) =>
                              Math.min(index + 1, matchingRestaurants.length - 1),
                            );
                          } else if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setActiveRestaurantIndex((index) => Math.max(index - 1, 0));
                          } else if (event.key === "Enter" && restaurantSearchOpen) {
                            event.preventDefault();
                            const selected =
                              matchingRestaurants[activeRestaurantIndex] ?? matchingRestaurants[0];
                            if (selected) selectRestaurant(selected);
                          }
                        }}
                        className={FIELD_CLASS}
                      />

                      {restaurantSearchOpen && (
                        <div
                          id="log-visit-restaurant-results"
                          role="listbox"
                          aria-label="Restaurant search results"
                          className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-20 max-h-72 overflow-y-auto rounded-lg border border-line bg-surface p-1.5 shadow-xl"
                        >
                          {!restaurantQuery.trim() && matchingRestaurants.length > 0 && (
                            <p className="px-3 pt-1.5 pb-1 text-[0.6875rem] font-semibold tracking-[0.12em] text-ink-faint uppercase">
                              Recently seen
                            </p>
                          )}
                          {matchingRestaurants.length > 0 ? (
                            matchingRestaurants.map((restaurant, index) => {
                              const nameJa = restaurant.name_ja?.trim() || null;
                              const nameEn = restaurant.name_en?.trim() || null;
                              const title = nameJa ?? nameEn ?? restaurant.place_id;
                              const subtitle = nameEn && nameEn !== title ? nameEn : null;
                              const metadata = restaurantMetadataParts(
                                restaurant.category,
                                restaurant,
                              ).join(" · ");
                              return (
                                <button
                                  key={restaurant.place_id}
                                  id={`log-visit-restaurant-option-${index}`}
                                  type="button"
                                  role="option"
                                  aria-selected={placeId === restaurant.place_id}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onMouseEnter={() => setActiveRestaurantIndex(index)}
                                  onClick={() => selectRestaurant(restaurant)}
                                  className={`block w-full rounded-md px-3 py-2.5 text-left transition-colors ${
                                    index === activeRestaurantIndex ? "bg-lavender-50" : "hover:bg-subtle"
                                  }`}
                                >
                                  <span
                                    lang={nameJa ? "ja" : "en"}
                                    className="block font-display text-base leading-tight text-ink"
                                  >
                                    {title}
                                  </span>
                                  {(subtitle || metadata) && (
                                    <span className="mt-1 block text-xs leading-5 text-ink-muted">
                                      {[subtitle, metadata].filter(Boolean).join(" · ")}
                                    </span>
                                  )}
                                </button>
                              );
                            })
                          ) : (
                            <p className="px-3 py-3 text-sm text-ink-muted">
                              {restaurantQuery.trim()
                                ? "No matching restaurants."
                                : "No revealed restaurants yet."}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {catalogError && (
                    <p role="alert" className="mt-2 text-sm text-rose-dust">
                      {catalogError}
                    </p>
                  )}
                </>
              )}
            </div>

            <div>
              <label htmlFor="log-visit-date" className={`block ${FIELD_LABEL_CLASS}`}>
                Visit date
              </label>
              <input
                id="log-visit-date"
                required
                type="date"
                value={visitDate}
                onChange={(event) => setVisitDate(event.target.value)}
                className={FIELD_CLASS}
              />
            </div>

            <fieldset>
              <legend className={FIELD_LABEL_CLASS}>How was it?</legend>
              <StarRatingInput
                value={rating}
                onChange={setRating}
                describedBy={validationAttempted && (!placeId || (!editingVisit && rating === null))
                  ? "log-visit-rating-error"
                  : undefined}
              />
              {validationAttempted && (!placeId || (!editingVisit && rating === null)) && (
                <p id="log-visit-rating-error" role="alert" className="mt-2 text-xs leading-5 text-rose-dust">
                  {!placeId && rating === null
                    ? "Choose a restaurant and a star rating."
                    : !placeId
                      ? "Choose a restaurant before saving."
                      : "Choose a star rating before saving."}
                </p>
              )}
            </fieldset>

            <div>
              {/* Privacy is stated once, quietly, beside the field it applies to. */}
              <label
                htmlFor="log-visit-note"
                className={`flex items-center gap-1.5 ${FIELD_LABEL_CLASS}`}
              >
                <LockGlyph />
                <span>
                  Private note <span className="font-medium normal-case">(optional)</span>
                </span>
              </label>
              <textarea
                id="log-visit-note"
                aria-describedby="log-visit-note-hint"
                value={privateNote}
                onChange={(event) => setPrivateNote(event.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Something you want to remember…"
                className="mt-2 w-full resize-y rounded-lg border border-line bg-canvas px-3 py-3 text-sm leading-6 text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
              />
              <p id="log-visit-note-hint" className="mt-2 text-xs leading-5 text-ink-faint">
                Only you can see this. Notes never appear on a restaurant page.
              </p>
            </div>

            {formError && (
              <p role="alert" className="text-sm text-rose-dust">
                {formError}
              </p>
            )}
          </div>

          <footer className="border-t border-line px-5 py-4 sm:px-6">
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={saving || (!editingVisit && catalogLoading)}
            >
              {saving ? "Saving…" : "Save visit"}
            </Button>
          </footer>
        </form>
        )}
      </Sheet>
    </>
  );
}

function VisitHistorySections({
  visits,
  deletingId,
  onEdit,
  onDelete,
  compact = false,
}: {
  visits: RestaurantVisit[];
  deletingId: string | null;
  onEdit: (visit: RestaurantVisit) => void;
  onDelete: (visit: RestaurantVisit) => void;
  compact?: boolean;
}) {
  const months = groupByMonth(visits);
  return (
    /*
     * The month spine is the Log's own structure -- every rule here sits under a
     * month that has already happened -- so it is drawn warm. The hairlines
     * between individual entries stay neutral: recolouring those as well would
     * turn a journal into a gold-ruled ledger.
     */
    <div className="space-y-9 sm:space-y-11">
      {months.map((month) => (
        <section key={month.key} aria-label={month.label}>
          <div className="flex items-end justify-between gap-4 border-b border-gold-line pb-2">
            <h2 className="font-display text-2xl leading-tight text-ink">{month.label}</h2>
            <p className="text-xs font-medium tracking-[0.08em] text-ink-faint uppercase">
              {countLabel(month.visits.length)}
            </p>
          </div>
          <ol className="divide-y divide-line">
            {month.visits.map((visit) => (
              <VisitEntry
                key={visit.id}
                visit={visit}
                deleting={deletingId === visit.id}
                onEdit={() => onEdit(visit)}
                onDelete={() => onDelete(visit)}
                compact={compact}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function MobileVisitHistory({
  loadState,
  loadError,
  visits,
  deletingId,
  onRetry,
  onEdit,
  onDelete,
}: {
  loadState: LoadState;
  loadError: string | null;
  visits: RestaurantVisit[];
  deletingId: string | null;
  onRetry: () => void;
  onEdit: (visit: RestaurantVisit) => void;
  onDelete: (visit: RestaurantVisit) => void;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line px-5 py-4">
        <Link
          href="/log"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-plum"
        >
          <span aria-hidden="true">←</span>
          <span>Back to Log a visit</span>
        </Link>
        <p className="mt-2 text-[0.6875rem] font-semibold tracking-[0.14em] text-lavender-700 uppercase">
          Tokyo edition
        </p>
        <h2 className="mt-1.5 font-display text-3xl leading-tight text-ink">History</h2>
      </header>
      <div className="flex-1 px-5 py-6">
        {loadState === "loading" ? (
          <div className="py-10 text-center" role="status">
            <p className="text-sm text-ink-muted">Loading your history…</p>
          </div>
        ) : loadState === "error" ? (
          <section role="alert">
            <h3 className="font-display text-xl text-ink">We couldn’t load your history.</h3>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              {loadError ?? "We couldn’t load your history."}
            </p>
            <Button className="mt-4" onClick={onRetry}>
              Retry
            </Button>
          </section>
        ) : visits.length === 0 ? (
          <section role="status">
            <h3 className="font-display text-xl text-ink">No visits logged yet</h3>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              Your saved visits will appear here.
            </p>
          </section>
        ) : (
          <VisitHistorySections
            visits={visits}
            deletingId={deletingId}
            onEdit={onEdit}
            onDelete={onDelete}
            compact
          />
        )}
      </div>
    </div>
  );
}

function HistoryGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.2 5.2A5.5 5.5 0 1 1 2.5 8M2.5 3.5v4h4" />
      <path d="M8 4.8V8l2.2 1.4" />
    </svg>
  );
}

/** 12px line-art padlock. Decorative: the privacy wording carries the meaning. */
function LockGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className="size-3 shrink-0 text-lavender-700"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="5.25" width="8" height="5.75" rx="1.25" />
      <path d="M4 5.25V3.5a2 2 0 0 1 4 0v1.75" />
    </svg>
  );
}

function LogEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="w-full overflow-hidden rounded-card border border-line bg-surface"
    >
      <div
        aria-hidden="true"
        className="relative h-32 overflow-hidden border-b border-line bg-canvas sm:h-40"
      >
        <Image
          src="/images/log-empty-table.png"
          alt=""
          fill
          sizes="(min-width: 640px) 48rem, 100vw"
          className="object-cover object-center"
        />
      </div>
      <div className="p-5 sm:p-6">
        <h2 className="font-display text-2xl leading-tight text-ink">No visits logged yet</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-ink-muted">
          Keep a private record of the restaurants you discover.
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-plum underline decoration-transparent underline-offset-4 transition-colors hover:decoration-lavender-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
        >
          <span>Log your first visit</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}

function VisitEntry({
  visit,
  deleting,
  onEdit,
  onDelete,
  compact = false,
}: {
  visit: RestaurantVisit;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  const nameJa = visit.restaurant.name_ja?.trim() || null;
  const nameEn = visit.restaurant.name_en?.trim() || null;
  const title = nameJa ?? nameEn ?? "Unnamed restaurant";
  const subtitle = nameEn && nameEn !== title ? nameEn : null;
  const metadata = restaurantMetadataParts(
    visit.restaurant.primary_category,
    visit.restaurant,
  ).join(" · ");

  return (
    <li className="py-5 first:pt-4 last:pb-0 sm:py-6 sm:first:pt-5">
      {/*
       * No card: entries sit straight on the page, divided by a hairline, so the
       * photography is the only block of colour in the run.
       */}
      <article
        className={
          compact
            ? "min-w-0"
            : "grid min-w-0 gap-3 min-[480px]:grid-cols-[minmax(8.5rem,28%)_minmax(0,1fr)] min-[480px]:items-stretch min-[480px]:gap-5"
        }
      >
        {!compact && (
          <RestaurantPhoto
            placeId={visit.place_id}
            restaurantName={title}
            fill
            className="h-36 min-w-0 min-[480px]:h-full min-[480px]:min-h-36"
          />
        )}
        <div className="flex min-w-0 flex-col">
          {/*
           * The dateline is champagne rather than lavender: an entry in the Log
           * is a meal that has already happened, which is exactly what the
           * secondary accent is for. The form that creates an entry keeps its
           * lavender eyebrow, because that is an action happening now.
           */}
          <time
            dateTime={visit.visited_at}
            className="text-[0.6875rem] font-medium tracking-[0.14em] text-gold-700 uppercase"
          >
            <span aria-hidden="true">{formatVisitDay(visit.visited_at)}</span>
            {/* The dateline is abbreviated by design; assistive tech gets it whole. */}
            <span className="sr-only">{formatVisitDate(visit.visited_at)}</span>
          </time>
          <h3
            lang={nameJa ? "ja" : "en"}
            className="mt-1.5 font-display text-2xl leading-tight text-ink"
          >
            {title}
          </h3>
          {subtitle && <p className="mt-1 text-sm leading-snug text-ink-muted">{subtitle}</p>}
          {metadata && (
            <p className="mt-1 text-xs leading-5 text-ink-faint">{metadata}</p>
          )}
          {visit.rating !== null ? (
            <p
              aria-label={`${visit.rating} out of 5 stars`}
              className="mt-1.5 text-sm tracking-[0.08em] text-lavender-600"
            >
              <span aria-hidden="true">{starText(visit.rating)}</span>
            </p>
          ) : visit.reaction ? (
            <p className="mt-1.5 text-xs font-medium text-plum/80">
              {reactionLabel(visit.reaction)}
            </p>
          ) : null}
          {visit.private_note && (
            // A margin annotation rather than a panel: hairline rule, smaller
            // type, so the note stays clearly secondary to the visit itself.
            // The rule is warm, matching the dateline it hangs beneath.
            <p className="mt-3 border-l border-gold-line pl-3 text-[0.8125rem] leading-6 whitespace-pre-wrap text-ink-muted">
              {visit.private_note}
            </p>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 pt-3">
            <Link
              href={`/restaurants/${encodeURIComponent(visit.place_id)}`}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-plum underline decoration-transparent underline-offset-4 transition-colors hover:decoration-lavender-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
            >
              <span>View restaurant</span>
              <span aria-hidden="true">→</span>
            </Link>
            {!compact && <div className="flex items-center">
              <button
                type="button"
                onClick={onEdit}
                className="min-h-11 px-1 text-[0.8125rem] font-medium text-ink-faint transition-colors hover:text-plum"
              >
                Edit
              </button>
              <span aria-hidden="true" className="text-ink-faint">
                ·
              </span>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="min-h-11 px-1 text-[0.8125rem] font-medium text-ink-faint transition-colors hover:text-rose-dust disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>}
          </div>
        </div>
      </article>
    </li>
  );
}

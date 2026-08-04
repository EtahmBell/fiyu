"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { RestaurantPhoto } from "@/components/restaurant/RestaurantPhoto";
import { TagList } from "@/components/restaurant/TagList";
import { ScoreMark } from "@/components/ui/ScoreMark";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchDefaultListSmartView, fetchDefaultListSmartViews } from "@/lib/api/client";
import { DestinationPage } from "@/components/destinations/DestinationPage";
import { ACTIVE_FIYU_CITY } from "@/lib/city/editions";
import { FiyuApiError } from "@/lib/api/errors";
import type { DefaultListItem, SmartViewCatalogEntry, SmartViewResponse } from "@/lib/api/schemas";
import { useDefaultList } from "@/lib/lists/useDefaultList";
import { getOrCreateAnonymousOwnerKey } from "@/lib/lists/identity";
import { cn } from "@/lib/utils/cn";

const NEARBY_FALLBACK_ORIGIN = {
  latitude: 35.681236,
  longitude: 139.767125,
} as const;

function BookmarkIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn("size-5", className)}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-bookmark-state={filled ? "saved" : "unsaved"}
    >
      <path d="M7 4.75A1.75 1.75 0 0 1 8.75 3h6.5A1.75 1.75 0 0 1 17 4.75v15l-5-3.25-5 3.25v-15Z" />
    </svg>
  );
}

function newestFirst(items: DefaultListItem[]): DefaultListItem[] {
  return [...items].sort((a, b) => Date.parse(b.added_at) - Date.parse(a.added_at));
}

/**
 * One saved restaurant as a wide editorial row.
 *
 * Deliberately the same geometry as a Picks compact card -- photo column,
 * identity beside a score mark, hairline tags, a text action row -- so moving
 * from Picks to the list is not a change of language. Only fields the list
 * endpoint actually returns appear here: no description, no dates, no activity.
 */
function SavedRow({
  item,
  pending,
  onRemove,
}: {
  item: DefaultListItem;
  pending: boolean;
  onRemove(): void;
}) {
  const nameJa = item.restaurant.name_ja?.trim() || null;
  const nameEn = item.restaurant.name_en?.trim() || null;
  const title = nameJa ?? nameEn ?? "Unnamed restaurant";
  const subtitle = nameEn && nameEn !== title ? nameEn : null;
  const tags = [item.restaurant.primary_category, item.restaurant.neighborhood].filter(
    (tag): tag is string => Boolean(tag?.trim()),
  );

  return (
    <li className="min-w-0">
      <article
        className="min-w-0 overflow-hidden rounded-card border border-line bg-surface p-3 shadow-[0_6px_20px_-18px_rgba(49,40,61,0.35)] sm:p-3.5"
        aria-labelledby={`saved-${item.place_id}`}
      >
        <div className="grid min-w-0 grid-cols-1 items-stretch gap-3 min-[480px]:grid-cols-[minmax(8.5rem,30%)_minmax(0,1fr)] min-[480px]:gap-4">
          <RestaurantPhoto
            placeId={item.place_id}
            restaurantName={title}
            fill
            className="h-36 min-w-0 min-[480px]:h-full min-[480px]:min-h-36"
          />

          <div className="flex min-w-0 flex-col">
            {/*
             * Name and score share one row against a fixed score column, so a
             * long Japanese name shrinks rather than colliding with the numeral.
             */}
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1 pt-0.5">
                <h2
                  id={`saved-${item.place_id}`}
                  lang={nameJa ? "ja" : "en"}
                  className="truncate font-display text-xl leading-tight text-ink"
                >
                  {title}
                </h2>
                {subtitle && (
                  <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-ink-muted">
                    {subtitle}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-start gap-1">
                <ScoreMark score={item.restaurant.fiyu_score} size="md" />
                <button
                  type="button"
                  aria-label="Remove restaurant from saved"
                  aria-pressed={true}
                  disabled={pending}
                  onClick={onRemove}
                  className="inline-flex size-11 shrink-0 items-center justify-center text-plum transition-[color,transform] duration-[180ms] ease-(--ease-fiyu) hover:bg-lavender-50 hover:text-lavender-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <BookmarkIcon filled={true} />
                </button>
              </div>
            </div>

            {tags.length > 0 && <TagList tags={tags} max={2} titleCaseEnglish className="mt-2.5" />}

            <div className="mt-auto flex min-w-0 items-center gap-3 pt-3">
              <Link
                href={`/restaurants/${encodeURIComponent(item.place_id)}`}
                className="inline-flex min-h-11 min-w-0 items-center gap-1.5 text-sm font-semibold text-plum underline decoration-transparent underline-offset-4 transition-colors hover:decoration-lavender-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
              >
                <span>View restaurant</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </article>
    </li>
  );
}

/** Same row geometry, so nothing shifts when the list lands. */
function SavedRowSkeleton() {
  return (
    <li className="min-w-0 rounded-card border border-line bg-surface p-3 sm:p-3.5">
      <div className="grid min-w-0 grid-cols-1 items-stretch gap-3 min-[480px]:grid-cols-[minmax(8.5rem,30%)_minmax(0,1fr)] min-[480px]:gap-4">
        <Skeleton className="h-36 w-full rounded-lg min-[480px]:h-full min-[480px]:min-h-36" />
        <div className="min-w-0">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2.5 pt-0.5">
              <Skeleton className="h-6 w-3/5" />
              <Skeleton className="h-3.5 w-2/5" />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Skeleton className="h-2 w-7 rounded-full" />
              <Skeleton className="h-6 w-9" />
              <Skeleton className="h-px w-7" />
            </div>
          </div>
          <div className="mt-3 flex gap-1.5">
            <Skeleton className="h-6 w-20 rounded-chip" />
            <Skeleton className="h-6 w-16 rounded-chip" />
          </div>
          <Skeleton className="mt-4 h-4 w-32" />
        </div>
      </div>
    </li>
  );
}

const PAGE_HEADER = {
  eyebrow: "Tokyo edition",
  title: "Your Tokyo list",
  description: "Restaurants you save in Tokyo appear here.",
} as const;

export function TokyoListPage() {
  const cityId = ACTIVE_FIYU_CITY.id;
  const list = useDefaultList(cityId);
  const [activeTab, setActiveTab] = useState<"saved" | "smart">("saved");
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);
  const [smartViews, setSmartViews] = useState<SmartViewCatalogEntry[]>([]);
  const [openedViewKey, setOpenedViewKey] = useState<string | null>(null);
  const [openedView, setOpenedView] = useState<SmartViewResponse | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== "smart") return;
    if (smartViews.length > 0) return;

    let cancelled = false;
    const load = async () => {
      setSmartLoading(true);
      setSmartError(null);
      try {
        const identity = { clientId: getOrCreateAnonymousOwnerKey() };
        const payload = await fetchDefaultListSmartViews(cityId, identity);
        if (cancelled) return;
        setSmartViews(payload.views);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof FiyuApiError ? error.detail : "Could not load Smart Views";
        setSmartError(message ?? "Could not load Smart Views");
      } finally {
        if (!cancelled) setSmartLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeTab, cityId, smartViews.length]);

  const openSmartView = async (viewKey: string) => {
    setOpenedViewKey(viewKey);
    setViewLoading(true);
    setSmartError(null);
    try {
      const identity = { clientId: getOrCreateAnonymousOwnerKey() };
      const response = await fetchDefaultListSmartView(cityId, viewKey, identity, {
        ...(viewKey === "nearby"
          ? {
              originLatitude: NEARBY_FALLBACK_ORIGIN.latitude,
              originLongitude: NEARBY_FALLBACK_ORIGIN.longitude,
            }
          : {}),
      });
      setOpenedView(response);
    } catch (error) {
      const message = error instanceof FiyuApiError ? error.detail : "Could not open Smart View";
      setSmartError(message ?? "Could not open Smart View");
      setOpenedView(null);
    } finally {
      setViewLoading(false);
    }
  };

  if (cityId !== "tokyo") {
    return (
      <DestinationPage {...PAGE_HEADER}>
        <section role="status" aria-live="polite" className="max-w-md">
          <h2 className="font-display text-2xl leading-tight text-ink">
            Lists are unavailable in this city
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Tokyo is currently the only supported city.
          </p>
        </section>
      </DestinationPage>
    );
  }

  const loading = list.status === "loading" || list.status === "idle";
  const items = newestFirst(list.list?.items ?? []);
  // Only ever derived from a loaded list -- never a local guess or a placeholder.
  const countLabel =
    list.status === "ready" && items.length > 0
      ? `${items.length} saved ${items.length === 1 ? "place" : "places"}`
      : null;

  return (
    <DestinationPage {...PAGE_HEADER}>
      <div className="mb-4 flex items-center gap-2 border-b border-line pb-3">
        <button
          type="button"
          aria-pressed={activeTab === "saved"}
          onClick={() => setActiveTab("saved")}
          className={cn(
            "min-h-10 rounded-md border px-3 text-sm",
            activeTab === "saved"
              ? "border-plum bg-lavender-100 text-plum"
              : "border-line bg-surface text-ink-muted",
          )}
        >
          Saved
        </button>
        <button
          type="button"
          aria-pressed={activeTab === "smart"}
          onClick={() => setActiveTab("smart")}
          className={cn(
            "min-h-10 rounded-md border px-3 text-sm",
            activeTab === "smart"
              ? "border-plum bg-lavender-100 text-plum"
              : "border-line bg-surface text-ink-muted",
          )}
        >
          Smart
        </button>
      </div>

      {activeTab === "smart" ? (
        <section aria-label="Smart Views" className="space-y-3">
          {smartLoading ? (
            <p role="status" className="text-sm text-ink-muted">
              Loading Smart Views...
            </p>
          ) : (
            <ul className="space-y-2">
              {smartViews.map((view) => (
                <li key={view.key} className="rounded-card border border-line bg-surface p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{view.label}</p>
                      <p className="text-xs text-ink-muted">{view.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void openSmartView(view.key)}
                      className="min-h-10 rounded-md border border-line px-3 text-sm text-plum"
                    >
                      Open ({view.item_count})
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {viewLoading && (
            <p role="status" className="text-sm text-ink-muted">
              Opening view...
            </p>
          )}

          {openedView && openedViewKey === openedView.view_key && (
            <section className="rounded-card border border-line bg-surface p-3" aria-label="Opened Smart View">
              <h2 className="font-display text-xl text-ink">{openedView.label}</h2>
              <p className="text-sm text-ink-muted">{openedView.description}</p>
              {openedView.groups.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {openedView.groups.map((group) => (
                    <li key={group.group_key}>
                      <h3 className="text-sm font-semibold text-ink">{group.title}</h3>
                      <ul className="mt-1 space-y-1 text-sm text-ink-muted">
                        {group.items.map((item) => (
                          <li key={item.place_id}>{item.restaurant.name_ja ?? item.restaurant.name_en ?? item.place_id}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="mt-3 space-y-1 text-sm text-ink-muted">
                  {openedView.items.map((item) => (
                    <li key={item.place_id}>
                      {item.restaurant.name_ja ?? item.restaurant.name_en ?? item.place_id}
                      {item.distance_km !== null ? ` (${item.distance_km} km)` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {smartError && (
            <p role="status" className="text-xs text-dusty-rose">
              {smartError}
            </p>
          )}
        </section>
      ) : (
        <>
          {countLabel && (
            <p className="mb-4 border-b border-line pb-3 text-xs font-medium tracking-[0.1em] text-ink-faint uppercase">
              {countLabel}
            </p>
          )}

          {loading ? (
            <section role="status" aria-busy="true" aria-live="polite" aria-label="Loading your Tokyo list">
              <span className="sr-only">Loading your saved places…</span>
              <ul aria-hidden="true" className="space-y-3">
                <SavedRowSkeleton />
                <SavedRowSkeleton />
                <SavedRowSkeleton />
              </ul>
            </section>
          ) : list.status === "error" ? (
            // Visually distinct from an empty list: a bordered notice with an
            // action, not the quiet text-led empty state.
            <section
              role="status"
              aria-live="polite"
              className="max-w-md rounded-card border border-line bg-surface p-4 sm:p-5"
            >
              <h2 className="font-display text-2xl leading-tight text-ink">
                We couldn&rsquo;t load your Tokyo list.
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">Try again in a moment.</p>
              <button
                type="button"
                onClick={() => void list.retry()}
                className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-plum transition-colors hover:border-lavender-600 hover:bg-lavender-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
              >
                Retry
              </button>
            </section>
          ) : items.length === 0 ? (
            <section role="status" aria-live="polite" className="max-w-xl rounded-card border border-line bg-lavender-50/20 p-4 sm:p-5">
              <div aria-hidden="true" className="rounded-lg border border-line bg-surface p-3">
                <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-3">
                  <div className="h-16 rounded-md bg-lavender-100/50" />
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-2">
                        <div className="h-3.5 w-2/3 rounded-sm bg-lavender-100/55" />
                        <div className="h-2.5 w-1/2 rounded-sm bg-lavender-100/45" />
                      </div>
                      <BookmarkIcon filled={false} className="mt-0.5 text-lavender-500/75" />
                    </div>
                    <div className="mt-3 h-2.5 w-5/6 rounded-sm bg-lavender-100/40" />
                  </div>
                </div>
              </div>
              <h2 className="mt-4 font-display text-2xl leading-tight text-ink">No saved places yet</h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                Save a restaurant from your daily Picks and it will appear here.
              </p>
              <Link
                href="/picks"
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-plum underline decoration-transparent underline-offset-4 transition-colors hover:decoration-lavender-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
              >
                <span>Explore today&rsquo;s Picks</span>
                <span aria-hidden="true">→</span>
              </Link>
            </section>
          ) : (
            <section aria-label="Saved restaurants">
              <ul className="space-y-3">
                {items.map((item) => (
                  <SavedRow
                    key={item.place_id}
                    item={item}
                    pending={list.pendingPlaceIds.includes(item.place_id)}
                    onRemove={() => void list.toggle(item.place_id)}
                  />
                ))}
              </ul>
              {list.operationError && (
                <p role="status" className="mt-3 text-xs text-dusty-rose">
                  {list.operationError}
                </p>
              )}
            </section>
          )}
        </>
      )}
    </DestinationPage>
  );
}

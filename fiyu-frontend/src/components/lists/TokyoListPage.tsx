"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { RestaurantPhoto } from "@/components/restaurant/RestaurantPhoto";
import { TagList } from "@/components/restaurant/TagList";
import { ScoreMark } from "@/components/ui/ScoreMark";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchDefaultListSmartViews, fetchRestaurants } from "@/lib/api/client";
import { DestinationPage } from "@/components/destinations/DestinationPage";
import { ACTIVE_FIYU_CITY } from "@/lib/city/editions";
import { FiyuApiError } from "@/lib/api/errors";
import type { DefaultListItem, SmartViewCatalogEntry } from "@/lib/api/schemas";
import { useDefaultList } from "@/lib/lists/useDefaultList";
import { getOrCreateAnonymousOwnerKey } from "@/lib/lists/identity";
import { cn } from "@/lib/utils/cn";
import { ListTabs } from "@/components/lists/ListTabs";
import { SmartViewCard } from "@/components/lists/SmartViewCard";
import { PremiumSmartCollectionCard } from "@/components/lists/PremiumSmartCollectionCard";
import { buildListTagLookup, resolveListTags, type ListTagLookup } from "@/components/lists/listTags";
import {
  SMART_VIEW_ORDER,
  isPremiumSmartView,
  smartViewTintClass,
  sortSmartViews,
} from "@/components/lists/smartViewPresentation";

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
  tags,
  pending,
  onRemove,
}: {
  item: DefaultListItem;
  tags: string[];
  pending: boolean;
  onRemove(): void;
}) {
  const nameJa = item.restaurant.name_ja?.trim() || null;
  const nameEn = item.restaurant.name_en?.trim() || null;
  const title = nameJa ?? nameEn ?? "Unnamed restaurant";
  const subtitle = nameEn && nameEn !== title ? nameEn : null;

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
                  className="inline-flex size-11 shrink-0 items-center justify-center text-plum transition-[background-color,color,transform] duration-[180ms] ease-(--ease-fiyu) hover:bg-lavender-50/55 hover:text-lavender-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <BookmarkIcon filled={true} />
                </button>
              </div>
            </div>

            {tags.length > 0 && <TagList tags={tags} max={3} titleCaseEnglish className="mt-2.5" />}

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

/**
 * Contextual strip above the saved rows.
 *
 * The count is the loaded list's own length and the title is a fixed label --
 * nothing here is a computed statistic. A pale lavender wash rather than a
 * card: it exists to break the cream field and give the list a shoulder to sit
 * under, so it stays lighter than anything below it.
 */
function SavedCollectionStrip({ countLabel }: { countLabel: string }) {
  return (
    <div className="relative mb-5 overflow-hidden rounded-lg bg-lavender-50/40 px-4 py-3">
      <svg
        aria-hidden="true"
        viewBox="0 0 160 56"
        className="pointer-events-none absolute right-1 top-1 hidden h-12 text-lavender-600/30 sm:block"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 45h138" />
        <path d="M22 45V30h10v15M35 45V24h13v21M50 45V28h9v17" />
        <path d="M66 45V25h11v20M79 45V18h14v27M95 45V22h10v23" />
        <path d="M112 45V20" />
        <path d="M112 20 106 33h12Z" />
        <path d="M112 12 108 20h8Z" />
        <path d="M124 45V26h8v19M133 45V30h9v15" />
      </svg>
      <div className="relative flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-lg leading-tight text-ink">Your Tokyo collection</p>
        <p className="text-xs font-medium tracking-[0.1em] text-lavender-700 uppercase">
          {countLabel}
        </p>
      </div>
    </div>
  );
}

/** Smart View card geometry in its own tint, so the grid arrives already composed. */
function SmartViewCardSkeleton({ viewKey }: { viewKey: string }) {
  return (
    <li className={cn(smartViewTintClass(viewKey), viewKey === "nearby" && "sm:col-span-2")}>
      <div className="flex min-h-[10.5rem] h-full flex-col rounded-card border border-[color:var(--fiyu-tint-edge)] bg-[color:var(--fiyu-tint-surface)] px-4 py-4">
        <div className="size-9 rounded-full bg-[color:var(--fiyu-tint-disk)]" />
        <Skeleton className="mt-4 h-6 w-2/5" />
        <Skeleton className="mt-3 h-3.5 w-4/5" />
        <Skeleton className="mt-auto h-3.5 w-24" />
      </div>
    </li>
  );
}

const SAVED_PAGE_HEADER = {
  eyebrow: "Tokyo edition",
  title: "Your Tokyo list",
  description: "Restaurants you save in Tokyo appear here.",
} as const;

const SMART_PAGE_HEADER = {
  eyebrow: "Tokyo edition",
  title: "Smart views",
  description: "Your saved places, reorganized for different ways of exploring Tokyo.",
} as const;

export function TokyoListPage({ initialTab = "saved" }: { initialTab?: "saved" | "smart" }) {
  const cityId = ACTIVE_FIYU_CITY.id;
  const list = useDefaultList(cityId);
  const [activeTab, setActiveTab] = useState<"saved" | "smart">(initialTab);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);
  const [smartViews, setSmartViews] = useState<SmartViewCatalogEntry[]>([]);
  const [lockedPremiumView, setLockedPremiumView] = useState<SmartViewCatalogEntry | null>(null);
  const [tagLookup, setTagLookup] = useState<ListTagLookup>(new Map());

  useEffect(() => {
    if (list.status !== "ready") return;
    if ((list.list?.item_count ?? 0) === 0) return;
    if (tagLookup.size > 0) return;

    let cancelled = false;
    const loadTags = async () => {
      try {
        const catalog = await fetchRestaurants(100);
        if (cancelled) return;
        setTagLookup(buildListTagLookup(catalog.restaurants));
      } catch {
        if (!cancelled) setTagLookup(new Map());
      }
    };

    void loadTags();
    return () => {
      cancelled = true;
    };
  }, [list.list?.item_count, list.status, tagLookup.size]);

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
        setSmartViews(sortSmartViews(payload.views));
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

  if (cityId !== "tokyo") {
    return (
      <DestinationPage {...SAVED_PAGE_HEADER}>
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
  const heading = activeTab === "smart" ? SMART_PAGE_HEADER : SAVED_PAGE_HEADER;
  const freeSmartViews = smartViews.filter((view) => !isPremiumSmartView(view));
  const premiumSmartViews = smartViews.filter((view) => isPremiumSmartView(view));

  return (
    <DestinationPage {...heading}>
      <div className={cn(activeTab === "smart" ? "-mt-3" : "")}> 
        <ListTabs activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === "smart" ? (
        <section
          role="tabpanel"
          id="lists-panel-smart"
          aria-labelledby="lists-tab-smart"
          aria-label="Smart Views"
          className="space-y-7"
        >
          <section aria-label="Free Smart Views" className="space-y-3">
            {smartLoading ? (
              <>
                <p role="status" aria-live="polite" className="sr-only">
                  Loading Smart Views…
                </p>
                <ul aria-hidden="true" className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                  {SMART_VIEW_ORDER.slice(0, 5).map((key) => (
                    <SmartViewCardSkeleton key={key} viewKey={key} />
                  ))}
                </ul>
              </>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4" role="list">
                {freeSmartViews.map((view) => (
                  <SmartViewCard key={view.key} view={view} />
                ))}
              </ul>
            )}
          </section>

          {(smartLoading || premiumSmartViews.length > 0) && (
            <section aria-label="Fiyu Premium" className="space-y-3 border-t border-line pt-5">
              <header>
                <p className="text-[0.68rem] font-semibold tracking-[0.12em] text-lavender-700 uppercase">
                  Fiyu Premium
                </p>
                <h2 className="mt-1 font-display text-2xl leading-tight text-ink">Made for you</h2>
                <p className="mt-1 text-sm leading-6 text-ink-muted">
                  Dynamic collections shaped from your saved places.
                </p>
              </header>

              {smartLoading ? (
                <ul aria-hidden="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 sm:gap-4">
                  {SMART_VIEW_ORDER.slice(5).map((key) => (
                    <SmartViewCardSkeleton key={key} viewKey={key} />
                  ))}
                </ul>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 sm:gap-4" role="list">
                  {premiumSmartViews.map((view) => (
                    <PremiumSmartCollectionCard
                      key={view.key}
                      view={view}
                      onLockedOpen={(lockedView) => setLockedPremiumView(lockedView)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {smartError && (
            <p role="status" className="text-xs text-rose-dust">
              {smartError}
            </p>
          )}

          {lockedPremiumView && (
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Premium collection"
              className="fixed inset-0 z-40 flex items-end justify-center bg-black/25 px-4 py-6 sm:items-center"
            >
              <div className="w-full max-w-md rounded-card border border-line bg-surface p-4 shadow-[0_10px_32px_-24px_rgba(49,40,61,0.4)] sm:p-5">
                <p className="text-[0.68rem] font-semibold tracking-[0.12em] text-lavender-700 uppercase">
                  Premium collection
                </p>
                <h3 className="mt-1 font-display text-2xl leading-tight text-ink">
                  {lockedPremiumView.title ?? lockedPremiumView.label}
                </h3>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  Fiyu Premium turns your saved restaurants into more personalized collections and plans.
                </p>
                <button
                  type="button"
                  onClick={() => setLockedPremiumView(null)}
                  className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-plum transition-colors hover:border-lavender-600 hover:bg-lavender-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
                >
                  Close
                </button>
              </div>
            </section>
          )}
        </section>
      ) : (
        <section
          role="tabpanel"
          id="lists-panel-saved"
          aria-labelledby="lists-tab-saved"
          aria-label="Saved restaurants"
        >
          {countLabel && <SavedCollectionStrip countLabel={countLabel} />}

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
            <section role="status" aria-live="polite" className="max-w-xl rounded-card border border-line bg-lavender-50/60 p-4 sm:p-5">
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
                    tags={resolveListTags(tagLookup, item.place_id, item.restaurant.primary_category)}
                    pending={list.pendingPlaceIds.includes(item.place_id)}
                    onRemove={() => void list.toggle(item.place_id)}
                  />
                ))}
              </ul>
              {list.operationError && (
                <p role="status" className="mt-3 text-xs text-rose-dust">
                  {list.operationError}
                </p>
              )}
            </section>
          )}
        </section>
      )}
    </DestinationPage>
  );
}

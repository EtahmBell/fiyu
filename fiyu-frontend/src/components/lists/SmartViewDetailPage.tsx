"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { DestinationPage } from "@/components/destinations/DestinationPage";
import { RestaurantPhoto } from "@/components/restaurant/RestaurantPhoto";
import { TagList } from "@/components/restaurant/TagList";
import { ScoreMark } from "@/components/ui/ScoreMark";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  fetchDefaultListSmartView,
  fetchDefaultListSmartViews,
  fetchRestaurants,
} from "@/lib/api/client";
import { FiyuApiError } from "@/lib/api/errors";
import type {
  SmartViewCatalogEntry,
  SmartViewItem,
  SmartViewResponse,
} from "@/lib/api/schemas";
import { getOrCreateAnonymousOwnerKey } from "@/lib/lists/identity";
import { formatRestaurantBudget } from "@/lib/restaurant/budget";
import {
  buildListRestaurantLookup,
  buildListTagLookup,
  resolveListTags,
  type ListRestaurantLookup,
  type ListTagLookup,
} from "@/components/lists/listTags";
import {
  isKnownSmartViewKey,
  isUnavailableForMissingArea,
  NEARBY_FALLBACK_ORIGIN,
  smartViewDisplayLabel,
  smartViewDescriptionForCard,
  smartViewTitleFromKey,
} from "@/components/lists/smartViewPresentation";

function SmartViewItemRow({
  item,
  tags,
  budget,
}: {
  item: SmartViewItem;
  tags: string[];
  budget: string | null;
}) {
  const nameJa = item.restaurant.name_ja?.trim() || null;
  const nameEn = item.restaurant.name_en?.trim() || null;
  const title = nameJa ?? nameEn ?? "Unnamed restaurant";
  const subtitle = nameEn && nameEn !== title ? nameEn : null;
  const metadata = [item.restaurant.primary_category, item.restaurant.neighborhood]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      data-testid="smart-list-restaurant-card"
      className="min-w-0 rounded-card border border-line bg-surface p-2.5 min-[480px]:p-3.5"
    >
      <article
        data-testid="smart-list-card-layout"
        className="grid min-w-0 grid-cols-[6.75rem_minmax(0,1fr)] items-stretch gap-2.5 min-[480px]:grid-cols-[minmax(8.5rem,30%)_minmax(0,1fr)] min-[480px]:gap-4"
      >
        <RestaurantPhoto
          placeId={item.place_id}
          restaurantName={title}
          fill
          className="h-24 min-w-0 w-full min-[480px]:h-full min-[480px]:min-h-36"
        />

        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 lang={nameJa ? "ja" : "en"} className="line-clamp-2 font-display text-lg leading-tight text-ink min-[480px]:block min-[480px]:truncate min-[480px]:text-xl">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-0.5 line-clamp-1 text-xs leading-snug text-ink-muted min-[480px]:mt-1 min-[480px]:line-clamp-2 min-[480px]:text-[0.8125rem]">{subtitle}</p>
              )}
            </div>
            <div className="shrink-0">
              <ScoreMark score={item.restaurant.fiyu_score} size="sm" className="min-[480px]:hidden" />
              <ScoreMark score={item.restaurant.fiyu_score} size="md" className="hidden min-[480px]:flex" />
            </div>
          </div>

          {metadata && (
            <p className="mt-1 line-clamp-1 text-[0.6875rem] leading-4 text-ink-faint min-[480px]:hidden">
              {metadata}
            </p>
          )}
          {budget && (
            <p className="mt-1 text-[0.6875rem] font-medium leading-4 text-ink-muted min-[480px]:hidden">
              {budget}
            </p>
          )}
          {tags.length > 0 && (
            <TagList tags={tags} max={3} titleCaseEnglish className="mt-2.5 hidden min-[480px]:flex" />
          )}

          <div className="mt-auto pt-1 min-[480px]:pt-3">
            <Link
              href={`/restaurants/${encodeURIComponent(item.place_id)}`}
              className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-plum underline decoration-transparent underline-offset-4 transition-colors hover:decoration-lavender-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600 min-[480px]:min-h-11 min-[480px]:gap-1.5 min-[480px]:text-sm"
            >
              <span>View restaurant</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </article>
    </li>
  );
}

function SmartViewItemsSkeleton() {
  return (
    <ul aria-hidden="true" className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <li key={index} className="min-w-0 rounded-card border border-line bg-surface p-2.5 min-[480px]:p-3.5">
          <div className="grid min-w-0 grid-cols-[6.75rem_minmax(0,1fr)] items-stretch gap-2.5 min-[480px]:grid-cols-[minmax(8.5rem,30%)_minmax(0,1fr)] min-[480px]:gap-4">
            <Skeleton className="h-24 w-full rounded-lg min-[480px]:h-full min-[480px]:min-h-36" />
            <div className="space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-4 w-36" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SmartViewDetailPage({ viewKey }: { viewKey: string }) {
  const invalidViewKey = !isKnownSmartViewKey(viewKey);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalogEntry, setCatalogEntry] = useState<SmartViewCatalogEntry | null>(null);
  const [view, setView] = useState<SmartViewResponse | null>(null);
  const [tagLookup, setTagLookup] = useState<ListTagLookup>(new Map());
  const [restaurantLookup, setRestaurantLookup] = useState<ListRestaurantLookup>(new Map());

  const fallbackTitle = useMemo(() => smartViewTitleFromKey(viewKey), [viewKey]);

  useEffect(() => {
    if (invalidViewKey) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const identity = { clientId: getOrCreateAnonymousOwnerKey() };
        const catalog = await fetchDefaultListSmartViews("tokyo", identity);
        if (cancelled) return;
        const entry = catalog.views.find((candidate) => candidate.key === viewKey) ?? null;
        if (!entry) {
          setCatalogEntry(null);
          setView(null);
          setError("Unknown Smart View");
          return;
        }
        setCatalogEntry(entry);
        if (entry.locked || entry.available === false) {
          setView(null);
          return;
        }
        const payload = await fetchDefaultListSmartView("tokyo", viewKey, identity, {
          ...(viewKey === "nearby"
            ? {
                originLatitude: NEARBY_FALLBACK_ORIGIN.latitude,
                originLongitude: NEARBY_FALLBACK_ORIGIN.longitude,
              }
            : {}),
        });
        if (cancelled) return;
        setView(payload);
      } catch (cause) {
        if (cancelled) return;
        let message = cause instanceof FiyuApiError ? cause.detail : "Could not load this Smart View";
        if (typeof message === "string" && message.toLowerCase().includes("premium")) {
          message = "This Premium collection is unavailable for this account.";
        }
        setError(message ?? "Could not load this Smart View");
        setView(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [invalidViewKey, viewKey]);

  useEffect(() => {
    const hasItems = Boolean(view && (view.items.length > 0 || view.groups.some((group) => group.items.length > 0)));
    if (!hasItems) return;

    let cancelled = false;
    const loadTags = async () => {
      try {
        const catalog = await fetchRestaurants(100);
        if (cancelled) return;
        setTagLookup(buildListTagLookup(catalog.restaurants));
        setRestaurantLookup(buildListRestaurantLookup(catalog.restaurants));
      } catch {
        if (!cancelled) {
          setTagLookup(new Map());
          setRestaurantLookup(new Map());
        }
      }
    };

    void loadTags();
    return () => {
      cancelled = true;
    };
  }, [view]);

  const resolvedError = invalidViewKey ? "Unknown Smart View" : error;
  const countLabel =
    view && view.item_count !== null && view.item_count > 0
      ? `${view.item_count} ${view.item_count === 1 ? "place" : "places"}`
      : null;
  const titleSource = view ?? catalogEntry;
  const title = titleSource
    ? smartViewDisplayLabel(
        "view_key" in titleSource ? titleSource.view_key : titleSource.key,
        titleSource.title ?? titleSource.label,
      )
    : fallbackTitle;
  const description = view
    ? smartViewDescriptionForCard({
        key: view.view_key,
        description: view.description,
        item_count: view.item_count,
      })
    : catalogEntry?.description ?? "Rediscover your saved places in different ways.";
  const unavailableForArea = catalogEntry ? isUnavailableForMissingArea(catalogEntry) : false;

  return (
    <DestinationPage
      eyebrow="Tokyo edition"
      title={title}
      description={description}
    >
      <div className="mb-5">
        <Link
          href="/lists?tab=smart"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-plum underline decoration-transparent underline-offset-4 transition-colors hover:decoration-lavender-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
        >
          <span aria-hidden="true">←</span>
          <span>Back to Smart Lists</span>
        </Link>
      </div>

      {invalidViewKey ? (
        <section role="status" aria-live="polite" className="max-w-md rounded-card border border-line bg-surface p-4 sm:p-5">
          <h2 className="font-display text-2xl leading-tight text-ink">We couldn&apos;t load this Smart View.</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Try again in a moment.</p>
        </section>
      ) : (
        <>

          {countLabel && (
            <p className="mb-4 border-b border-line pb-3 text-xs font-medium tracking-[0.1em] text-ink-faint uppercase">
              {countLabel}
            </p>
          )}

          {loading ? (
            <section role="status" aria-busy="true" aria-live="polite" aria-label="Loading Smart View">
              <span className="sr-only">Loading Smart View…</span>
              <SmartViewItemsSkeleton />
            </section>
          ) : resolvedError ? (
            <section role="status" aria-live="polite" className="max-w-md rounded-card border border-line bg-surface p-4 sm:p-5">
              <h2 className="font-display text-2xl leading-tight text-ink">We couldn&apos;t load this Smart View.</h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                {resolvedError === "Could not load this Smart View" ? "Try again in a moment." : resolvedError}
              </p>
            </section>
          ) : catalogEntry?.locked ? (
            <section role="status" aria-live="polite" className="max-w-xl rounded-card border border-line bg-lavender-50/20 p-4 sm:p-5">
              <h2 className="font-display text-2xl leading-tight text-ink">Premium collection</h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                Fiyu Premium turns your saved restaurants into more personalized collections and plans.
              </p>
            </section>
          ) : view?.groups.length ? (
            <section aria-label="Neighbourhood groups" className="space-y-5">
              {view.groups.map((group) => (
                <section key={group.group_key} className="space-y-2">
                  <div className="flex items-end justify-between border-b border-line pb-2">
                    <h2 className="font-display text-2xl leading-tight text-ink">{group.title}</h2>
                    <p className="text-xs font-medium tracking-[0.08em] text-ink-faint uppercase">
                      {group.item_count} {group.item_count === 1 ? "place" : "places"}
                    </p>
                  </div>
                  <ul className="space-y-3">
                    {group.items.map((item) => (
                      <SmartViewItemRow
                        key={item.place_id}
                        item={item}
                        tags={resolveListTags(tagLookup, item.place_id, item.restaurant.primary_category)}
                        budget={formatRestaurantBudget(restaurantLookup.get(item.place_id)?.budget)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </section>
          ) : (
            <section aria-label="Smart View restaurants">
              {catalogEntry?.available === false ? (
                <div className="max-w-xl rounded-card border border-line bg-lavender-50/20 p-4 sm:p-5">
                  <h2 className="font-display text-2xl leading-tight text-ink">This collection is unavailable</h2>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">
                    {catalogEntry.unavailable_reason ?? "This collection is currently unavailable."}
                  </p>
                  {unavailableForArea && (
                    <Link
                      href="/picks"
                      className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-plum underline decoration-transparent underline-offset-4 transition-colors hover:decoration-lavender-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
                    >
                      <span>Set discovery origin</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  )}
                </div>
              ) : view && view.items.length > 0 ? (
                <ul className="space-y-3">
                  {view.items.map((item) => (
                    <SmartViewItemRow
                      key={item.place_id}
                      item={item}
                      tags={resolveListTags(tagLookup, item.place_id, item.restaurant.primary_category)}
                      budget={formatRestaurantBudget(restaurantLookup.get(item.place_id)?.budget)}
                    />
                  ))}
                </ul>
              ) : (
                <div className="max-w-xl rounded-card border border-line bg-lavender-50/20 p-4 sm:p-5">
                  <h2 className="font-display text-2xl leading-tight text-ink">No places yet</h2>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">
                    Save a restaurant from your daily Picks and it will appear here.
                  </p>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </DestinationPage>
  );
}

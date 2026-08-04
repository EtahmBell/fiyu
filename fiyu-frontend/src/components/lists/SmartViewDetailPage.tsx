"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { DestinationPage } from "@/components/destinations/DestinationPage";
import { RestaurantPhoto } from "@/components/restaurant/RestaurantPhoto";
import { TagList } from "@/components/restaurant/TagList";
import { ScoreMark } from "@/components/ui/ScoreMark";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchDefaultListSmartView } from "@/lib/api/client";
import { FiyuApiError } from "@/lib/api/errors";
import type { SmartViewItem, SmartViewResponse } from "@/lib/api/schemas";
import { getOrCreateAnonymousOwnerKey } from "@/lib/lists/identity";
import {
  isKnownSmartViewKey,
  NEARBY_FALLBACK_ORIGIN,
  smartViewDisplayLabel,
  smartViewDescriptionForCard,
  smartViewTitleFromKey,
} from "@/components/lists/smartViewPresentation";

function SmartViewItemRow({ item }: { item: SmartViewItem }) {
  const nameJa = item.restaurant.name_ja?.trim() || null;
  const nameEn = item.restaurant.name_en?.trim() || null;
  const title = nameJa ?? nameEn ?? "Unnamed restaurant";
  const subtitle = nameEn && nameEn !== title ? nameEn : null;
  const tags = [item.restaurant.primary_category, item.restaurant.neighborhood].filter(
    (tag): tag is string => Boolean(tag?.trim()),
  );

  return (
    <li className="min-w-0 rounded-card border border-line bg-surface p-3 sm:p-3.5">
      <article className="grid min-w-0 grid-cols-1 items-stretch gap-3 min-[480px]:grid-cols-[minmax(8.5rem,30%)_minmax(0,1fr)] min-[480px]:gap-4">
        <RestaurantPhoto
          placeId={item.place_id}
          restaurantName={title}
          fill
          className="h-36 min-w-0 min-[480px]:h-full min-[480px]:min-h-36"
        />

        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 lang={nameJa ? "ja" : "en"} className="truncate font-display text-xl leading-tight text-ink">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-ink-muted">{subtitle}</p>
              )}
            </div>
            <div className="shrink-0">
              <ScoreMark score={item.restaurant.fiyu_score} size="md" />
            </div>
          </div>

          {tags.length > 0 && <TagList tags={tags} max={2} titleCaseEnglish className="mt-2.5" />}

          <div className="mt-auto pt-3">
            <Link
              href={`/restaurants/${encodeURIComponent(item.place_id)}`}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-plum underline decoration-transparent underline-offset-4 transition-colors hover:decoration-lavender-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
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
        <li key={index} className="min-w-0 rounded-card border border-line bg-surface p-3 sm:p-3.5">
          <div className="grid min-w-0 grid-cols-1 items-stretch gap-3 min-[480px]:grid-cols-[minmax(8.5rem,30%)_minmax(0,1fr)] min-[480px]:gap-4">
            <Skeleton className="h-36 w-full rounded-lg min-[480px]:h-full min-[480px]:min-h-36" />
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
  const [view, setView] = useState<SmartViewResponse | null>(null);

  const fallbackTitle = useMemo(() => smartViewTitleFromKey(viewKey), [viewKey]);

  useEffect(() => {
    if (invalidViewKey) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const identity = { clientId: getOrCreateAnonymousOwnerKey() };
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
        const message = cause instanceof FiyuApiError ? cause.detail : "Could not load this Smart View";
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

  const resolvedError = invalidViewKey ? "Unknown Smart View" : error;
  const countLabel =
    view && view.item_count > 0
      ? `${view.item_count} ${view.item_count === 1 ? "place" : "places"}`
      : null;
  const title = view ? smartViewDisplayLabel(view.view_key, view.label) : fallbackTitle;
  const description = view
    ? smartViewDescriptionForCard({
        key: view.view_key,
        label: view.label,
        description: view.description,
        item_count: view.item_count,
      })
    : "Rediscover your saved places in different ways.";

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
          <span>Back to Smart</span>
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
              <p className="mt-2 text-sm leading-6 text-ink-muted">Try again in a moment.</p>
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
                      <SmartViewItemRow key={item.place_id} item={item} />
                    ))}
                  </ul>
                </section>
              ))}
            </section>
          ) : (
            <section aria-label="Smart View restaurants">
              {view && view.items.length > 0 ? (
                <ul className="space-y-3">
                  {view.items.map((item) => (
                    <SmartViewItemRow key={item.place_id} item={item} />
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

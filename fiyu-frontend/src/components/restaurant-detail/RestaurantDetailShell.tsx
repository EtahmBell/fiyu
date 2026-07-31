"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { FiyuMap } from "@/components/map/FiyuMap";
import { MapUnavailable } from "@/components/map/MapUnavailable";
import { OutboundMapActions } from "@/components/restaurant/OutboundMapActions";
import { TagList } from "@/components/restaurant/TagList";
import { RestaurantPhotoGallery } from "@/components/restaurant-detail/RestaurantPhotoGallery";
import { ScoreMark } from "@/components/ui/ScoreMark";
import type { GooglePhoto, PublicRestaurant, PublicRestaurantDetail } from "@/lib/api/schemas";
import { selectionIsActive, browserDailyPicksStorage } from "@/lib/daily-picks/storage";
import { recentDiscoveries } from "@/lib/daily-picks/history";
import { resolveNames } from "@/lib/format/language";
import { formatTagForDisplay } from "@/lib/format/tags";
import { mappableRestaurants } from "@/lib/geo/mappable";
import { PICKS_DETAIL_MAP_SESSION_KEY } from "@/lib/map/viewportSession";
import { readPicksReturnState } from "@/lib/navigation/restaurantDetail";
import { cn } from "@/lib/utils/cn";

const subscribeClock = (listener: () => void) => {
  const timer = window.setInterval(listener, 60_000);
  return () => window.clearInterval(timer);
};
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const serverMinute = () => 0;

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function sourceLabel(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Supporting source";
  }
}

function formatResearchDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function BackIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 fill-none stroke-current">
      <path d="m12.5 4.5-5 5.5 5 5.5" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
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

function SaveButton({ saved, onToggle, compact = false }: { saved: boolean; onToggle(): void; compact?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? "Remove restaurant from saved" : "Save restaurant"}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2 text-sm font-medium transition-[background-color,color,transform] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600",
        compact && "gap-1.5 px-1.5 text-xs",
        saved
          ? "text-plum hover:bg-lavender-50"
          : "text-ink-muted hover:bg-lavender-50/70 hover:text-plum",
      )}
    >
      <BookmarkIcon filled={saved} />
      <span>{saved ? "Saved" : "Save"}</span>
    </button>
  );
}

function DetailMap({ restaurants, placeId, className }: { restaurants: PublicRestaurant[]; placeId: string; className?: string }) {
  const mappable = useMemo(() => mappableRestaurants(restaurants), [restaurants]);
  if (mappable.length === 0) {
    return <MapUnavailable reason="no-mapped-restaurants" className={className} />;
  }
  return (
    <FiyuMap
      restaurants={mappable}
      selectedPlaceId={placeId}
      onSelect={() => undefined}
      surfaceMode="bounded"
      interactive
      viewportSessionKey={PICKS_DETAIL_MAP_SESSION_KEY}
      className={className}
    />
  );
}

function InformationAndSources({
  restaurant,
  photos,
}: {
  restaurant: PublicRestaurantDetail;
  photos: GooglePhoto[];
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const editorialSources = restaurant.supporting_source_urls
    .map(safeExternalUrl)
    .filter((value): value is string => value !== null);
  const locationSource = safeExternalUrl(restaurant.source_reference);
  const researched = formatResearchDate(restaurant.researched_at);
  const photoAuthors = [...new Set(
    photos.flatMap((photo) =>
      photo.author_attributions
        .map((attribution) => attribution.display_name)
        .filter((value): value is string => Boolean(value)),
    ),
  )];
  const hasInformation =
    editorialSources.length > 0 || Boolean(locationSource) || Boolean(researched) || photoAuthors.length > 0;
  if (!hasInformation) return null;

  return (
    <section
      data-testid="information-and-sources"
      className="min-w-0 border-y border-line"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
        className="flex min-h-11 w-full items-center justify-center gap-2 px-2 py-2 text-center text-sm font-medium text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
      >
        <span>Information and sources</span>
        <span
          aria-hidden="true"
          data-testid="information-chevron"
          className={cn(
            "text-xs text-lavender-700 transition-transform duration-200 motion-reduce:transition-none",
            expanded && "rotate-180",
          )}
        >
          {"\u25BE"}
        </span>
      </button>
      <div
        id={contentId}
        hidden={!expanded}
        className="min-w-0 space-y-3 border-t border-line px-2 py-4 text-left text-xs leading-relaxed text-ink-muted"
      >
        {researched && <p>Editorial research updated {researched}.</p>}
        {editorialSources.length > 0 && (
          <ul className="space-y-2">
            {editorialSources.map((source) => (
              <li key={source}>
                <a className="text-lavender-700 underline underline-offset-2" href={source} target="_blank" rel="noopener noreferrer nofollow">
                  {sourceLabel(source)}
                </a>
              </li>
            ))}
          </ul>
        )}
        {locationSource && (
          <p>
            Location source:{" "}
            <a className="text-lavender-700 underline underline-offset-2" href={locationSource} target="_blank" rel="noopener noreferrer nofollow">
              OpenStreetMap object
            </a>
            {restaurant.provenance?.attribution ? ` · ${restaurant.provenance.attribution}` : ""}
          </p>
        )}
        {photoAuthors.length > 0 && <p>Photo attribution: {photoAuthors.join(", ")}.</p>}
      </div>
    </section>
  );
}

function RestaurantDetailContent({
  restaurant,
  saved,
  onToggleSaved,
  mapRestaurants,
}: {
  restaurant: PublicRestaurantDetail;
  saved: boolean;
  onToggleSaved(): void;
  mapRestaurants: PublicRestaurant[];
}) {
  const names = resolveNames(restaurant);
  const title = names.primary?.text ?? "Restaurant";
  // Photo descriptors are transient component state and are never written to
  // browser storage. The stable callback also prevents a gallery refetch.
  const [photos, setPhotos] = useState<GooglePhoto[]>([]);
  const updatePhotos = useCallback((nextPhotos: GooglePhoto[]) => setPhotos(nextPhotos), []);

  const formatDetails = [restaurant.restaurant_type_en, ...restaurant.cuisine_terms_en].filter(
    (value): value is string => Boolean(value?.trim()),
  );

  return (
    <article className="space-y-8 pb-12" style={{ animation: "fiyu-reveal-in 220ms var(--ease-fiyu) both" }}>
      <RestaurantPhotoGallery
        placeId={restaurant.place_id}
        restaurantName={title}
        onPhotosChange={updatePhotos}
      />

      <section aria-labelledby="restaurant-identity-heading" className="space-y-4">
        <div className="flex min-w-0 items-start justify-between gap-5">
          <div className="min-w-0">
            <h1 id="restaurant-identity-heading" lang={names.primary?.lang} className="font-display text-3xl leading-tight text-ink sm:text-4xl">
              {title}
            </h1>
            {names.secondary && <p lang={names.secondary.lang} className="mt-1.5 text-base text-ink-muted">{names.secondary.text}</p>}
            {restaurant.category && <p className="mt-3 text-sm text-ink-muted">{restaurant.category}</p>}
          </div>
          <ScoreMark score={restaurant.fiyu_score} size="lg" />
        </div>
        {restaurant.food_tags.length > 0 && (
          <TagList tags={restaurant.food_tags} titleCaseEnglish />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <SaveButton saved={saved} onToggle={onToggleSaved} />
          <OutboundMapActions restaurant={restaurant} />
        </div>
      </section>

      {restaurant.description_en && (
        <section aria-labelledby="about-heading" className="border-t border-line pt-6">
          <h2 id="about-heading" className="font-display text-2xl text-ink">About</h2>
          <p className="mt-3 max-w-prose whitespace-pre-line text-[0.9375rem] leading-7 text-ink/85">{restaurant.description_en}</p>
        </section>
      )}

      {restaurant.signature_dishes_en.length > 0 && (
        <section aria-labelledby="signature-dishes-heading" className="border-t border-line pt-6">
          <h2 id="signature-dishes-heading" className="font-display text-2xl text-ink">Signature dishes</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-ink/85">
            {restaurant.signature_dishes_en.map((dish) => <li key={dish}>{dish}</li>)}
          </ul>
        </section>
      )}

      {formatDetails.length > 0 && (
        <section aria-labelledby="menu-format-heading" className="border-t border-line pt-6">
          <h2 id="menu-format-heading" className="font-display text-2xl text-ink">Menu and format</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {formatDetails.map((detail) => <li key={detail} className="rounded-chip border border-line bg-subtle px-3 py-1.5 text-xs text-ink-muted">{formatTagForDisplay(detail)}</li>)}
          </ul>
        </section>
      )}

      {(restaurant.verified_core_address || restaurant.map_display_eligible) && (
        <section aria-labelledby="location-heading" className="border-t border-line pt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="location-heading" className="font-display text-2xl text-ink">Location</h2>
              {restaurant.verified_core_address && <p className="mt-2 text-sm leading-6 text-ink-muted">{restaurant.verified_core_address}</p>}
              {restaurant.map_location_approximate && <p className="mt-1 text-xs font-medium text-dusty-rose">{restaurant.location_label ?? "Approximate area"}</p>}
            </div>
            <OutboundMapActions restaurant={restaurant} />
          </div>
          <div aria-label={`Map showing ${title}`} className="mt-4 h-72 overflow-hidden rounded-card border border-line lg:hidden">
            <DetailMap restaurants={mapRestaurants} placeId={restaurant.place_id} className="h-full" />
          </div>
        </section>
      )}

      <InformationAndSources restaurant={restaurant} photos={photos} />
    </article>
  );
}

export function RestaurantDetailShell({
  restaurant,
  restaurants,
}: {
  restaurant: PublicRestaurantDetail;
  restaurants: PublicRestaurant[];
}) {
  const router = useRouter();
  const focusRef = useRef<HTMLElement>(null);
  const storage = useMemo(() => browserDailyPicksStorage(), []);
  const snapshot = useSyncExternalStore(storage.subscribe, storage.getSnapshot, storage.getServerSnapshot);
  const now = useSyncExternalStore(subscribeClock, currentMinute, serverMinute);
  const names = resolveNames(restaurant);
  const title = names.primary?.text ?? "Restaurant";

  useEffect(() => {
    focusRef.current?.focus({ preventScroll: true });
  }, []);

  const visibleRestaurants = useMemo(() => {
    const selection = snapshot?.selection && selectionIsActive(snapshot.selection, now)
      ? snapshot.selection
      : null;
    const recent = snapshot
      ? recentDiscoveries(snapshot.discoveries, new Set(selection?.restaurantIds ?? []), now)
      : [];
    const ids = new Set([
      ...(selection?.restaurantIds ?? []),
      ...recent.map((discovery) => discovery.restaurantId),
      restaurant.place_id,
    ]);
    return restaurants.filter((candidate) => ids.has(candidate.place_id));
  }, [now, restaurant.place_id, restaurants, snapshot]);

  const saved = snapshot?.savedRestaurantIds.includes(restaurant.place_id) ?? false;
  const toggleSaved = () => {
    if (!snapshot) return;
    storage.save({
      ...snapshot,
      savedRestaurantIds: saved
        ? snapshot.savedRestaurantIds.filter((id) => id !== restaurant.place_id)
        : [...snapshot.savedRestaurantIds, restaurant.place_id],
    });
  };
  const backToPicks = () => {
    const returnState = readPicksReturnState();
    if (returnState?.placeId === restaurant.place_id) router.back();
    else router.push("/picks");
  };

  return (
    <main
      ref={focusRef}
      tabIndex={-1}
      data-testid="restaurant-detail-layout"
      className="min-h-[100dvh] bg-canvas outline-none lg:grid lg:h-[calc(100dvh-var(--spacing-header))] lg:min-h-0 lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)] lg:overflow-hidden"
    >
      <header data-testid="mobile-detail-header" className="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-line bg-canvas/95 px-3 backdrop-blur-sm lg:hidden">
        <button type="button" onClick={backToPicks} aria-label="Back to Picks" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-ink-muted focus-visible:outline-2 focus-visible:outline-lavender-600">
          <BackIcon /> Back
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-sm font-medium text-ink">{title}</p>
        <SaveButton saved={saved} onToggle={toggleSaved} compact />
      </header>

      <section className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
        <div className="mx-auto w-full max-w-[42rem] px-5 py-5 sm:px-8 lg:max-w-none lg:px-8 lg:py-8">
          <button type="button" onClick={backToPicks} className="mb-6 hidden min-h-11 items-center gap-1 rounded-lg text-sm font-medium text-lavender-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600 lg:inline-flex">
            <BackIcon /> Back to Picks
          </button>
          <RestaurantDetailContent restaurant={restaurant} saved={saved} onToggleSaved={toggleSaved} mapRestaurants={visibleRestaurants} />
        </div>
      </section>

      <aside aria-label="Restaurant map" data-testid="desktop-detail-map" className="hidden min-h-0 min-w-0 border-l border-line bg-subtle lg:block">
        <DetailMap restaurants={visibleRestaurants} placeId={restaurant.place_id} className="h-full" />
      </aside>
    </main>
  );
}

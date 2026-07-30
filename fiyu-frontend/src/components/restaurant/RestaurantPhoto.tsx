"use client";

import { useEffect, useState } from "react";

import { fetchPhotoPreview } from "@/lib/api/client";
import type { GooglePhoto } from "@/lib/api/schemas";
import { useInView } from "@/lib/hooks/useInView";
import { cn } from "@/lib/utils/cn";

export interface RestaurantPhotoProps {
  placeId: string;
  /** Used only as the image's accessible name. */
  restaurantName: string;
  /** Fill a stable card region instead of using the default 16:9 aspect box. */
  fill?: boolean;
  className?: string;
}

/**
 * Lazily loaded Google photo preview for a card.
 *
 * Cost discipline: each preview is one billed Google request on the backend, so
 * nothing is fetched until the card nears the viewport, and the result is never
 * refetched for that card.
 *
 * Layout discipline: the 16:9 box is reserved before anything loads, so the
 * list never shifts under the reader. A missing photo keeps the same box.
 *
 * Attribution is mandatory and travels with the photo -- it is rendered here,
 * beside the image, not somewhere else on the card.
 *
 * The browser fetches the image bytes from the URL the backend returned. That
 * is a media fetch, not a Places API call: no Google key is involved and no
 * Places endpoint is contacted from the client.
 */
export function RestaurantPhoto({
  placeId,
  restaurantName,
  fill = false,
  className,
}: RestaurantPhotoProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [photo, setPhoto] = useState<GooglePhoto | null>(null);
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tappedOpen, setTappedOpen] = useState(false);

  useEffect(() => {
    if (!inView || photo || failed) return;

    const controller = new AbortController();
    fetchPhotoPreview(placeId, { signal: controller.signal })
      .then(setPhoto)
      .catch((error: unknown) => {
        // An abort is a cancelled card, not a failure worth showing.
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailed(true);
      });

    return () => controller.abort();
  }, [inView, photo, failed, placeId]);

  const attribution = photo?.author_attributions[0] ?? null;
  const hasPhotoInformation = Boolean(
    attribution?.display_name || photo?.google_maps_uri || photo?.flag_content_uri,
  );
  const informationVisible = hasPhotoInformation && (hovered || focused || tappedOpen);

  return (
    <div
      ref={ref}
      data-testid="restaurant-photo-region"
      tabIndex={photo && hasPhotoInformation ? 0 : undefined}
      aria-label={photo && hasPhotoInformation ? "Photo attribution" : undefined}
      aria-expanded={photo && hasPhotoInformation ? informationVisible : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(event) => {
        if (!photo || !hasPhotoInformation) return;
        event.stopPropagation();
        setTappedOpen((open) => !open);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setTappedOpen(false);
      }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      className={cn(
        "relative overflow-hidden rounded-lg bg-lavender-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600",
        className,
      )}
    >
      {/* Aspect box reserved up front, so nothing reflows when the image lands. */}
      <div className={cn("relative w-full", fill ? "h-full min-h-44" : "aspect-[16/9]")}>
        {photo ? (
          // A plain <img>, not next/image: the backend returns a short-lived
          // Google media URL, and next/image would cache it well beyond that
          // lifetime as well as needing Google's CDN allow-listed.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.media_url}
            alt={`${restaurantName}, photo from Google`}
            width={photo.width}
            height={photo.height}
            loading="lazy"
            decoding="async"
            onError={() => {
              setPhoto(null);
              setFailed(true);
            }}
            className="absolute inset-0 size-full object-cover"
            style={{ animation: "fiyu-fade-in 260ms var(--ease-fiyu)" }}
          />
        ) : (
          <PhotoPlaceholder pending={inView && !failed} />
        )}
      </div>

      {informationVisible && photo && (
        <div
          data-testid="photo-attribution-overlay"
          onClick={(event) => event.stopPropagation()}
          className="absolute inset-x-2 bottom-2 z-20 flex max-h-[48%] flex-wrap items-center gap-x-2 gap-y-1 overflow-y-auto rounded-md bg-plum/90 px-2.5 py-2 text-[0.6875rem] leading-tight text-white shadow-md backdrop-blur-sm"
        >
          {attribution?.display_name && <span>
            Photo by{" "}
            {attribution.uri ? (
              <a
                href={attribution.uri}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="underline decoration-white/60 underline-offset-2 hover:text-lavender-100 focus-visible:outline-1 focus-visible:outline-white"
              >
                {attribution.display_name}
              </a>
            ) : (
              attribution.display_name
            )}
          </span>}
          {photo?.google_maps_uri && (
            <a
              href={photo.google_maps_uri}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="underline decoration-white/60 underline-offset-2 hover:text-lavender-100 focus-visible:outline-1 focus-visible:outline-white"
            >
              View on Google Maps
            </a>
          )}
          {photo?.flag_content_uri && (
            <a
              href={photo.flag_content_uri}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="underline decoration-white/60 underline-offset-2 hover:text-lavender-100 focus-visible:outline-1 focus-visible:outline-white"
            >
              Report
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Branded lavender-and-cream stand-in.
 *
 * Deliberately not a grey box or a broken-image icon: an unavailable photo
 * should look like part of Fiyu, not like a fault.
 */
function PhotoPlaceholder({ pending }: { pending: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex items-center justify-center bg-lavender-50"
      style={{
        backgroundImage:
          "linear-gradient(135deg, var(--color-lavender-50) 0%, var(--map-marker-center) 100%)",
      }}
    >
      <span
        className={cn(
          "font-display text-2xl text-lavender-700",
          pending ? "opacity-30" : "opacity-45",
        )}
      >
        Fiyu
      </span>
    </div>
  );
}

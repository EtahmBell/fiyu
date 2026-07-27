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
export function RestaurantPhoto({ placeId, restaurantName, className }: RestaurantPhotoProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [photo, setPhoto] = useState<GooglePhoto | null>(null);
  const [failed, setFailed] = useState(false);

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

  return (
    <div ref={ref} className={cn("overflow-hidden rounded-lg bg-lavender-50", className)}>
      {/* Aspect box reserved up front, so nothing reflows when the image lands. */}
      <div className="relative aspect-[16/9] w-full">
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
            onError={() => setFailed(true)}
            className="absolute inset-0 size-full object-cover"
            style={{ animation: "fiyu-fade-in 260ms var(--ease-fiyu)" }}
          />
        ) : (
          <PhotoPlaceholder pending={inView && !failed} />
        )}
      </div>

      {attribution?.display_name && (
        <p className="flex flex-wrap items-center gap-x-1.5 px-2 py-1 text-[0.625rem] text-ink-faint">
          <span>
            Photo by{" "}
            {attribution.uri ? (
              <a
                href={attribution.uri}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="underline decoration-line underline-offset-2 hover:text-lavender-700"
              >
                {attribution.display_name}
              </a>
            ) : (
              attribution.display_name
            )}
          </span>
          {photo?.google_maps_uri && (
            <a
              href={photo.google_maps_uri}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="underline decoration-line underline-offset-2 hover:text-lavender-700"
            >
              View on Google Maps
            </a>
          )}
          {photo?.flag_content_uri && (
            <a
              href={photo.flag_content_uri}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="underline decoration-line underline-offset-2 hover:text-lavender-700"
            >
              Report
            </a>
          )}
        </p>
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

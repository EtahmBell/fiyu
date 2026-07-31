"use client";

import { useEffect, useRef, useState } from "react";

import { fetchPhotos } from "@/lib/api/client";
import type { GooglePhoto } from "@/lib/api/schemas";
import { cn } from "@/lib/utils/cn";

export interface RestaurantPhotoGalleryProps {
  placeId: string;
  restaurantName: string;
  onPhotosChange?: (photos: GooglePhoto[]) => void;
}

function PhotoPlaceholder({ unavailable = false }: { unavailable?: boolean }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center bg-lavender-50 text-center">
      <span className="font-display text-3xl text-lavender-700/55">Fiyu</span>
      <span className="mt-2 h-px w-10 bg-lavender-500/40" />
      <p className="mt-3 text-xs text-ink-muted">
        {unavailable ? "Photos unavailable right now" : "Loading restaurant photos"}
      </p>
    </div>
  );
}

function PhotoAttribution({ photo }: { photo: GooglePhoto }) {
  const author = photo.author_attributions[0] ?? null;
  if (!author?.display_name && !photo.google_maps_uri) return null;
  return (
    <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[0.6875rem] text-ink-faint">
      {author?.display_name && (
        <span>
          Photo by{" "}
          {author.uri ? (
            <a
              href={author.uri}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-lavender-700 underline decoration-line underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
            >
              {author.display_name}
            </a>
          ) : (
            author.display_name
          )}
        </span>
      )}
      {photo.google_maps_uri && (
        <a
          href={photo.google_maps_uri}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-lavender-700 underline decoration-line underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600"
        >
          Photo source on Google Maps
        </a>
      )}
    </p>
  );
}

/** Bounded, on-demand gallery. Photo URLs stay in component memory only. */
export function RestaurantPhotoGallery({
  placeId,
  restaurantName,
  onPhotosChange,
}: RestaurantPhotoGalleryProps) {
  const [photos, setPhotos] = useState<GooglePhoto[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedIndexes, setFailedIndexes] = useState<ReadonlySet<number>>(() => new Set());
  const [failed, setFailed] = useState(false);
  const mobileTrackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchPhotos(placeId, 5, { signal: controller.signal })
      .then((nextPhotos) => {
        setPhotos(nextPhotos);
        setActiveIndex(0);
        setFailedIndexes(new Set());
        onPhotosChange?.(nextPhotos);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailed(true);
        onPhotosChange?.([]);
      });
    return () => controller.abort();
  }, [onPhotosChange, placeId]);

  const markFailed = (index: number) => {
    setFailedIndexes((current) => new Set([...current, index]));
    if (index !== activeIndex) return;
    const replacement = photos.findIndex(
      (_, candidate) => candidate !== index && !failedIndexes.has(candidate),
    );
    if (replacement >= 0) setActiveIndex(replacement);
  };

  const showPhoto = (index: number) => {
    setActiveIndex(index);
    const track = mobileTrackRef.current;
    const slide = track?.children.item(index) as HTMLElement | null;
    if (track && slide && typeof track.scrollTo === "function") {
      track.scrollTo({ left: slide.offsetLeft, behavior: "smooth" });
    }
  };

  if (failed || (photos.length > 0 && failedIndexes.size >= photos.length)) {
    return (
      <section aria-labelledby="photo-gallery-heading">
        <h2 id="photo-gallery-heading" className="sr-only">Photos</h2>
        <div className="overflow-hidden rounded-card border border-line">
          <PhotoPlaceholder unavailable />
        </div>
      </section>
    );
  }

  if (photos.length === 0) {
    return (
      <section aria-labelledby="photo-gallery-heading">
        <h2 id="photo-gallery-heading" className="sr-only">Photos</h2>
        <div className="overflow-hidden rounded-card border border-line">
          <PhotoPlaceholder />
        </div>
      </section>
    );
  }

  const activePhoto = photos[activeIndex] ?? photos[0];

  return (
    <section aria-labelledby="photo-gallery-heading">
      <h2 id="photo-gallery-heading" className="sr-only">Photos</h2>

      <div className="hidden md:block">
        <div className="relative aspect-[16/10] overflow-hidden rounded-card bg-lavender-50">
          {/* Short-lived backend media URL: deliberately not passed through next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activePhoto.media_url}
            alt={`${restaurantName}, photo ${activeIndex + 1} from Google`}
            width={activePhoto.width}
            height={activePhoto.height}
            loading={activeIndex === 0 ? "eager" : "lazy"}
            decoding="async"
            onError={() => markFailed(activeIndex)}
            className="absolute inset-0 size-full object-cover"
          />
        </div>
        <PhotoAttribution photo={activePhoto} />

        {photos.length > 1 && (
          <div className="mt-3 grid grid-cols-5 gap-2" aria-label="Choose restaurant photo">
            {photos.map((photo, index) => (
              <button
                key={`${photo.media_url}:${index}`}
                type="button"
                aria-label={`Show photo ${index + 1}`}
                aria-pressed={activeIndex === index}
                onClick={() => showPhoto(index)}
                className={cn(
                  "relative aspect-[4/3] overflow-hidden rounded-lg border-2 bg-lavender-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lavender-600",
                  activeIndex === index ? "border-lavender-600" : "border-transparent",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.media_url}
                  alt=""
                  width={photo.width}
                  height={photo.height}
                  loading="lazy"
                  decoding="async"
                  onError={() => markFailed(index)}
                  className="absolute inset-0 size-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="md:hidden">
        <div
          ref={mobileTrackRef}
          aria-label="Restaurant photo gallery"
          className="flex snap-x snap-mandatory overflow-x-auto rounded-card bg-lavender-50"
          onScroll={(event) => {
            const width = event.currentTarget.clientWidth;
            if (width > 0) setActiveIndex(Math.round(event.currentTarget.scrollLeft / width));
          }}
        >
          {photos.map((photo, index) => (
            <div key={`${photo.media_url}:${index}`} className="relative aspect-[4/3] w-full shrink-0 snap-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.media_url}
                alt={`${restaurantName}, photo ${index + 1} from Google`}
                width={photo.width}
                height={photo.height}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                onError={() => markFailed(index)}
                className="absolute inset-0 size-full object-cover"
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-ink-faint">Photo {activeIndex + 1} of {photos.length}</p>
          {photos.length > 1 && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={activeIndex === 0}
                onClick={() => showPhoto(Math.max(0, activeIndex - 1))}
                className="min-h-11 rounded-chip border border-line px-3 text-xs text-ink-muted disabled:opacity-35"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={activeIndex === photos.length - 1}
                onClick={() => showPhoto(Math.min(photos.length - 1, activeIndex + 1))}
                className="min-h-11 rounded-chip border border-line px-3 text-xs text-ink-muted disabled:opacity-35"
              >
                Next
              </button>
            </div>
          )}
        </div>
        <PhotoAttribution photo={activePhoto} />
      </div>
    </section>
  );
}

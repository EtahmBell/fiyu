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

function PhotoPositionIndicator({
  photoCount,
  activeIndex,
}: {
  photoCount: number;
  activeIndex: number;
}) {
  if (photoCount <= 1) return null;

  return (
    <div
      data-testid="photo-position-indicator"
      aria-hidden="true"
      className="absolute inset-x-5 bottom-3 z-10 flex justify-center gap-1.5 rounded-full bg-plum/25 px-2.5 py-2 backdrop-blur-[2px]"
    >
      {Array.from({ length: photoCount }, (_, index) => (
        <span
          key={`photo-position-${index}`}
          data-active={activeIndex === index ? "true" : "false"}
          className={cn(
            "h-1 w-8 max-w-[14%] rounded-full shadow-[0_1px_2px_rgba(49,40,61,0.18)] transition-colors motion-reduce:transition-none",
            activeIndex === index ? "bg-cream" : "bg-lavender-100/65",
          )}
        />
      ))}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
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
    const nextIndex = Math.max(0, Math.min(photos.length - 1, index));
    setActiveIndex(nextIndex);
    const track = mobileTrackRef.current;
    const slide = track?.children.item(nextIndex) as HTMLElement | null;
    if (track && slide && typeof track.scrollTo === "function") {
      track.scrollTo({
        left: slide.offsetLeft,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
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
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Photo {activeIndex + 1} of {photos.length}
      </p>

      <div className="hidden md:block">
        <div className="relative aspect-[16/10] overflow-hidden rounded-card bg-lavender-50">
          {/* Short-lived backend media URL: deliberately not passed through next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            data-testid="desktop-active-gallery-photo"
            src={activePhoto.media_url}
            alt={`${restaurantName}, photo ${activeIndex + 1} from Google`}
            width={activePhoto.width}
            height={activePhoto.height}
            loading={activeIndex === 0 ? "eager" : "lazy"}
            decoding="async"
            onError={() => markFailed(activeIndex)}
            className="absolute inset-0 size-full object-cover"
          />
          {photos.length > 1 && (
            <>
              <button
                type="button"
                data-gallery-control="desktop-previous"
                aria-label="Previous photo"
                disabled={activeIndex === 0}
                onClick={() => showPhoto(activeIndex - 1)}
                className="absolute top-1/2 left-3 z-20 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-cream/90 text-2xl leading-none text-plum shadow-sm backdrop-blur-sm transition-colors hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream disabled:opacity-35 motion-reduce:transition-none"
              >
                <span aria-hidden="true">‹</span>
              </button>
              <button
                type="button"
                data-gallery-control="desktop-next"
                aria-label="Next photo"
                disabled={activeIndex === photos.length - 1}
                onClick={() => showPhoto(activeIndex + 1)}
                className="absolute top-1/2 right-3 z-20 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-cream/90 text-2xl leading-none text-plum shadow-sm backdrop-blur-sm transition-colors hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream disabled:opacity-35 motion-reduce:transition-none"
              >
                <span aria-hidden="true">›</span>
              </button>
            </>
          )}
          <PhotoPositionIndicator photoCount={photos.length} activeIndex={activeIndex} />
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

      <div className="min-w-0 max-w-full overflow-hidden md:hidden">
        <div className="relative min-w-0 max-w-full overflow-hidden rounded-card bg-lavender-50">
          <div
            ref={mobileTrackRef}
            role="region"
            aria-roledescription="carousel"
            aria-label="Restaurant photo gallery"
            className="flex w-full max-w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
            onScroll={(event) => {
              const width = event.currentTarget.clientWidth;
              if (width <= 0) return;
              const nextIndex = Math.round(event.currentTarget.scrollLeft / width);
              setActiveIndex(Math.max(0, Math.min(photos.length - 1, nextIndex)));
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
          <PhotoPositionIndicator photoCount={photos.length} activeIndex={activeIndex} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-ink-faint">Photo {activeIndex + 1} of {photos.length}</p>
          {photos.length > 1 && (
            <div className="sr-only md:hidden" data-testid="mobile-accessible-gallery-controls">
              <button
                type="button"
                aria-label="Previous photo"
                disabled={activeIndex === 0}
                onClick={() => showPhoto(activeIndex - 1)}
              >
                Previous photo
              </button>
              <button
                type="button"
                aria-label="Next photo"
                disabled={activeIndex === photos.length - 1}
                onClick={() => showPhoto(activeIndex + 1)}
              >
                Next photo
              </button>
            </div>
          )}
        </div>
        <PhotoAttribution photo={activePhoto} />
      </div>
    </section>
  );
}

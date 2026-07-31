export type NewlyRevealedMapPlaces = {
  eventId: string;
  placeIds: string[];
  revealedPlaceIds: string[];
  createdAt: number;
};

const REVEAL_EVENT_NAME = "fiyu:newly-revealed-map-places";
let revealEventSequence = 0;

function validRevealEvent(value: unknown): value is NewlyRevealedMapPlaces {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<NewlyRevealedMapPlaces>;
  return (
    typeof event.eventId === "string" &&
    event.eventId.length > 0 &&
    Array.isArray(event.placeIds) &&
    event.placeIds.every((placeId) => typeof placeId === "string" && placeId.length > 0) &&
    Array.isArray(event.revealedPlaceIds) &&
    event.revealedPlaceIds.every(
      (placeId) => typeof placeId === "string" && placeId.length > 0,
    ) &&
    typeof event.createdAt === "number" &&
    Number.isFinite(event.createdAt)
  );
}

/**
 * Sends a live, one-shot reveal event to map views that are already mounted.
 * Nothing is persisted or replayed, so hydration, route changes and opening a
 * map later cannot retrigger an old animation.
 */
export function publishNewlyRevealedMapPlaces(
  placeIds: readonly string[],
  createdAt = Date.now(),
  currentlyRevealedPlaceIds: readonly string[] = placeIds,
): NewlyRevealedMapPlaces | null {
  if (typeof window === "undefined") return null;
  const uniquePlaceIds = [...new Set(placeIds.filter((placeId) => placeId.length > 0))];
  if (uniquePlaceIds.length === 0) return null;
  revealEventSequence += 1;
  const event: NewlyRevealedMapPlaces = {
    eventId: `${createdAt}:${revealEventSequence}`,
    placeIds: uniquePlaceIds,
    revealedPlaceIds: [
      ...new Set(
        currentlyRevealedPlaceIds.filter((placeId) => placeId.length > 0),
      ),
    ],
    createdAt,
  };
  window.dispatchEvent(new CustomEvent(REVEAL_EVENT_NAME, { detail: event }));
  return event;
}

export function subscribeToNewlyRevealedMapPlaces(
  listener: (event: NewlyRevealedMapPlaces) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const receive = (browserEvent: Event) => {
    const event = (browserEvent as CustomEvent<unknown>).detail;
    if (validRevealEvent(event)) listener(event);
  };
  window.addEventListener(REVEAL_EVENT_NAME, receive);
  return () => window.removeEventListener(REVEAL_EVENT_NAME, receive);
}

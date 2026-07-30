import type { LocationAnchor } from "@/lib/api/schemas";
import type { GeolocationState } from "@/lib/hooks/useGeolocation";
import type { LatLng } from "@/lib/map/projection";

/** Free-MVP origins. Premium search can extend this union without changing cards. */
export type FreeDiscoveryOrigin =
  | { kind: "current-location"; point: LatLng; accuracyMeters: number | null }
  | { kind: "home-area"; area: LocationAnchor }
  | { kind: "unavailable" };

export interface FreeOriginSetup {
  origin: FreeDiscoveryOrigin | null;
  geolocation: GeolocationState;
  areaAnchors: LocationAnchor[];
  requestCurrentLocation(): void;
  chooseHomeArea(area: LocationAnchor): void;
  continueWithoutLocation(): void;
}

export function originFromGeolocation(
  state: GeolocationState,
): FreeDiscoveryOrigin | null {
  return state.status === "granted"
    ? {
        kind: "current-location",
        point: state.point,
        accuracyMeters: state.accuracyMeters,
      }
    : null;
}

function squaredDistance(left: LatLng, right: LatLng): number {
  const latitudeScale = Math.cos(((left.lat + right.lat) / 2) * (Math.PI / 180));
  const latitude = left.lat - right.lat;
  const longitude = (left.lng - right.lng) * latitudeScale;
  return latitude * latitude + longitude * longitude;
}

/** Resolve GPS to the nearest reviewed area without reverse-geocoding or a network call. */
export function nearestReviewedArea(
  point: LatLng,
  anchors: readonly LocationAnchor[],
): LocationAnchor | null {
  return anchors.reduce<LocationAnchor | null>((nearest, candidate) => {
    if (!nearest) return candidate;
    const candidatePoint = { lat: candidate.latitude, lng: candidate.longitude };
    const nearestPoint = { lat: nearest.latitude, lng: nearest.longitude };
    return squaredDistance(point, candidatePoint) < squaredDistance(point, nearestPoint)
      ? candidate
      : nearest;
  }, null);
}

export function originAreaName(
  origin: FreeDiscoveryOrigin | null,
  anchors: readonly LocationAnchor[],
): string | null {
  if (!origin || origin.kind === "unavailable") return null;
  if (origin.kind === "home-area") return origin.area.area_name;
  return nearestReviewedArea(origin.point, anchors)?.area_name ?? null;
}

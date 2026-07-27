import { haversineMeters } from "@/lib/geo/distance";
import type { MappableRestaurant } from "@/lib/geo/mappable";
import type { LatLng } from "@/lib/map/projection";

/**
 * The point distances are measured from.
 *
 * Three kinds, deliberately distinct types rather than one shape with a flag,
 * so the UI cannot accidentally describe an area centre as the user's own
 * position. That distinction is the whole point: an area anchor is a landmark
 * Fiyu chose, not where anybody is standing.
 *
 * Anchors are client-side only. Nothing here is sent to the backend or
 * persisted; a reload clears the anchor.
 */

export type DiscoveryAnchor =
  | {
      kind: "current-location";
      point: LatLng;
      /** Browser-reported accuracy radius in metres, when available. */
      accuracyMeters: number | null;
    }
  | {
      kind: "area-anchor";
      point: LatLng;
      id: string;
      /** e.g. "Shibuya Station" */
      displayName: string;
      /** e.g. "Shibuya" */
      areaName: string;
      /** Backend's own wording, e.g. "Approximate center of Shibuya". */
      qualifier: string;
    }
  | {
      kind: "manual-pin";
      point: LatLng;
    };

/** Title shown on the anchor's marker and in the location control. */
export function anchorLabel(anchor: DiscoveryAnchor): string {
  switch (anchor.kind) {
    case "current-location":
      return "You are here";
    case "area-anchor":
      return anchor.displayName;
    case "manual-pin":
      return "Your starting point";
  }
}

/**
 * The line beneath the label. For an area anchor this is the backend's own
 * qualifier, so the approximate nature is never Fiyu's paraphrase.
 */
export function anchorDescription(anchor: DiscoveryAnchor): string | null {
  switch (anchor.kind) {
    case "current-location":
      return anchor.accuracyMeters !== null
        ? `Accurate to about ${Math.round(anchor.accuracyMeters)} m`
        : null;
    case "area-anchor":
      return anchor.qualifier;
    case "manual-pin":
      return "Tap the map to move it";
  }
}

/** Suffix used in distance strings, naming what the distance is measured from. */
export function anchorDistanceSuffix(anchor: DiscoveryAnchor): string {
  switch (anchor.kind) {
    case "current-location":
      return "from your location";
    case "area-anchor":
      return `from ${anchor.areaName}`;
    case "manual-pin":
      return "from your starting point";
  }
}

/**
 * Whether the origin itself is imprecise.
 *
 * An area anchor is a nominal centre, and a low-accuracy GPS fix is not a
 * point either, so both force the "About" hedge on short distances.
 */
export function isApproximateOrigin(anchor: DiscoveryAnchor): boolean {
  if (anchor.kind === "area-anchor") return true;
  if (anchor.kind === "current-location") {
    return anchor.accuracyMeters !== null && anchor.accuracyMeters > 100;
  }
  return false;
}

/**
 * Distance from the anchor to a restaurant, in metres.
 *
 * Returns null when there is no anchor. Only mappable restaurants can be passed
 * in, which is enforced by the type: a restaurant the backend has not verified
 * has no coordinates to measure from, and guessing one would be inventing data.
 */
export function distanceToRestaurant(
  anchor: DiscoveryAnchor | null,
  restaurant: MappableRestaurant,
): number | null {
  if (!anchor) return null;
  return haversineMeters(anchor.point, {
    lat: restaurant.latitude,
    lng: restaurant.longitude,
  });
}

import { describe, expect, it } from "vitest";

import { publicRestaurantSchema } from "@/lib/api/schemas";
import { formatDistance } from "@/lib/geo/distance";
import { type MappableRestaurant, mappableRestaurants } from "@/lib/geo/mappable";
import {
  type DiscoveryAnchor,
  anchorDescription,
  anchorDistanceSuffix,
  anchorLabel,
  isApproximateOrigin,
  restaurantDistance,
} from "@/lib/location/anchor";

const CURRENT: DiscoveryAnchor = {
  kind: "current-location",
  point: { lat: 35.6812, lng: 139.7671 },
  accuracyMeters: 25,
};

const AREA: DiscoveryAnchor = {
  kind: "area-anchor",
  point: { lat: 35.658, lng: 139.7016 },
  id: "shibuya-station",
  displayName: "Shibuya Station",
  areaName: "Shibuya",
  qualifier: "Approximate center of Shibuya",
};

const PIN: DiscoveryAnchor = { kind: "manual-pin", point: { lat: 35.69, lng: 139.7 } };

/**
 * A precisely-located restaurant. `distance_sort_eligible` must be stated
 * explicitly: it defaults to false so that a partial backend response errs
 * toward hedging rather than claiming a precision it cannot support.
 */
function restaurant(lat: number, lng: number): MappableRestaurant {
  const [only] = mappableRestaurants([
    publicRestaurantSchema.parse({
      place_id: "r",
      latitude: lat,
      longitude: lng,
      location_precision: "exact",
      map_display_eligible: true,
      distance_sort_eligible: true,
    }),
  ]);
  return only;
}

describe("anchorLabel", () => {
  it("names each kind distinctly", () => {
    expect(anchorLabel(CURRENT)).toBe("You are here");
    expect(anchorLabel(AREA)).toBe("Shibuya Station");
    expect(anchorLabel(PIN)).toBe("Your starting point");
  });

  it("never labels an area anchor as the user's own position", () => {
    // The core distinction: an area centre is a landmark, not a person.
    expect(anchorLabel(AREA)).not.toMatch(/you|your/i);
  });
});

describe("anchorDescription", () => {
  it("uses the backend's own qualifier for an area anchor", () => {
    expect(anchorDescription(AREA)).toBe("Approximate center of Shibuya");
  });

  it("reports GPS accuracy when the browser supplies it", () => {
    expect(anchorDescription(CURRENT)).toBe("Accurate to about 25 m");
  });

  it("omits accuracy when the browser does not supply it", () => {
    expect(
      anchorDescription({ kind: "current-location", point: CURRENT.point, accuracyMeters: null }),
    ).toBeNull();
  });
});

describe("anchorDistanceSuffix", () => {
  it("names what the distance is measured from", () => {
    expect(anchorDistanceSuffix(CURRENT)).toBe("from your location");
    expect(anchorDistanceSuffix(AREA)).toBe("from Shibuya");
    expect(anchorDistanceSuffix(PIN)).toBe("from your starting point");
  });
});

describe("isApproximateOrigin", () => {
  it("always treats an area anchor as approximate", () => {
    expect(isApproximateOrigin(AREA)).toBe(true);
  });

  it("treats a good GPS fix as precise and a poor one as approximate", () => {
    expect(isApproximateOrigin(CURRENT)).toBe(false);
    expect(
      isApproximateOrigin({ kind: "current-location", point: CURRENT.point, accuracyMeters: 400 }),
    ).toBe(true);
  });

  it("treats a hand-placed pin as precise, since the user chose the point", () => {
    expect(isApproximateOrigin(PIN)).toBe(false);
  });
});

describe("restaurantDistance", () => {
  it("returns null when no anchor is set", () => {
    expect(restaurantDistance(null, restaurant(35.658, 139.7016))).toBeNull();
  });

  it("returns null for a restaurant with no verified position", () => {
    const unverified = publicRestaurantSchema.parse({
      place_id: "x",
      latitude: 35.658,
      longitude: 139.7016,
      map_display_eligible: false,
    });
    expect(restaurantDistance(CURRENT, unverified)).toBeNull();
  });

  it("measures from the anchor to the restaurant", () => {
    const measured = restaurantDistance(CURRENT, restaurant(35.658, 139.7016));
    expect(measured?.meters).toBeGreaterThan(6300);
    expect(measured?.meters).toBeLessThan(6700);
  });

  it("is zero when the restaurant sits on the anchor", () => {
    expect(restaurantDistance(AREA, restaurant(AREA.point.lat, AREA.point.lng))?.meters).toBe(0);
  });

  it("reports a precise measurement between two precise endpoints", () => {
    expect(restaurantDistance(CURRENT, restaurant(35.658, 139.7016))?.approximate).toBe(false);
  });

  it("reports approximate when the ORIGIN is an area anchor", () => {
    expect(restaurantDistance(AREA, restaurant(35.658, 139.7016))?.approximate).toBe(true);
  });

  /**
   * The half that was missing: a precise GPS fix measured to a chome centroid
   * used to render as a flat "310 m from your location".
   */
  it("reports approximate when the RESTAURANT is a chome anchor", () => {
    const chomeAnchored = publicRestaurantSchema.parse({
      place_id: "chome",
      latitude: 35.658,
      longitude: 139.7016,
      map_display_eligible: true,
      location_precision: "chome",
      map_location_approximate: true,
      distance_sort_eligible: false,
    });
    const measured = restaurantDistance(CURRENT, chomeAnchored);
    expect(measured).not.toBeNull();
    expect(measured?.approximate).toBe(true);
  });
});

describe("end-to-end phrasing", () => {
  it("produces the documented area-anchor wording", () => {
    const measured = restaurantDistance(AREA, restaurant(35.6675, 139.7100));
    expect(
      formatDistance(measured?.meters ?? null, {
        suffix: anchorDistanceSuffix(AREA),
        approximate: measured?.approximate ?? false,
      }),
    ).toMatch(/^About \d+(\.\d)? (m|km) from Shibuya$/);
  });

  it("produces the documented current-location wording", () => {
    const measured = restaurantDistance(CURRENT, restaurant(35.6819, 139.7680));
    expect(
      formatDistance(measured?.meters ?? null, {
        suffix: anchorDistanceSuffix(CURRENT),
        approximate: measured?.approximate ?? false,
      }),
    ).toMatch(/^\d+0 m from your location$/);
  });

  it("hedges and coarsens a precise fix measured to a chome anchor", () => {
    const chomeAnchored = publicRestaurantSchema.parse({
      place_id: "chome",
      latitude: 35.6819,
      longitude: 139.768,
      map_display_eligible: true,
      map_location_approximate: true,
      distance_sort_eligible: false,
    });
    const measured = restaurantDistance(CURRENT, chomeAnchored);
    const text = formatDistance(measured?.meters ?? null, {
      suffix: anchorDistanceSuffix(CURRENT),
      approximate: measured?.approximate ?? false,
      coarse: measured?.approximate ?? false,
    });
    // Hedged, and bucketed to 100 m rather than claiming 10 m precision.
    expect(text).toMatch(/^About \d+00 m from your location$/);
  });
});

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnchorMarker } from "@/components/map/AnchorMarker";
import { MapBase } from "@/components/map/MapBase";
import { MapControls } from "@/components/map/MapControls";
import { MapLabels } from "@/components/map/MapLabels";
import { MapLandmarks } from "@/components/map/MapLandmarks";
import { MapLegend } from "@/components/map/MapLegend";
import { MapMarkers } from "@/components/map/MapMarkers";
import { MapRestaurantPopup } from "@/components/map/MapRestaurantPopup";
import { MapStations } from "@/components/map/MapStations";
import type { MappableRestaurant } from "@/lib/geo/mappable";
import type { DiscoveryAnchor } from "@/lib/location/anchor";
import { type MarkerCluster, clusterMarkers } from "@/lib/map/clustering";
import { detailLevelFor, detailLevelLabel } from "@/lib/map/detail";
import { subscribeToNewlyRevealedMapPlaces } from "@/lib/map/revealEvents";
import { readMapViewportSession, saveMapViewportSession } from "@/lib/map/viewportSession";
import { type LatLng, VIEWBOX, isWithinBounds, project, unproject } from "@/lib/map/projection";
import {
  IDENTITY_VIEW,
  MAX_SCALE,
  MIN_SCALE,
  type MapView,
  clientToViewBox,
  fitPointsIfOutsideView,
  fitToPoints,
  panBy,
  transformFor,
  viewBoxToContent,
  zoomAt,
  zoomByStep,
} from "@/lib/map/viewport";
import { cn } from "@/lib/utils/cn";

export interface FiyuMapProps {
  restaurants: MappableRestaurant[];
  selectedPlaceId: string | null;
  onSelect: (restaurant: MappableRestaurant) => void;
  /**
   * Which surface the map is mounted on. Drives every class name.
   *
   * Deliberately NOT derived from a media query. `useMediaQuery` has to return a
   * fixed `false` on the server, so feeding it into a className produces markup
   * that differs between the server render and hydration. Desktop behaviour is
   * expressed with Tailwind `lg:` variants instead, which live in CSS and are
   * identical on both sides. Keep it that way.
   */
  surfaceMode?: "inline" | "bounded" | "fullscreen";
  /**
   * Whether to capture pan, zoom and pinch gestures.
   *
   * Behaviour only -- this must never reach rendered markup. Event handlers can
   * differ between server and client without any hydration consequence.
   */
  interactive?: boolean;
  /** Hide secondary context and controls only in the collapsed mobile mini-map. */
  compactOnMobile?: boolean;
  /** Render station rings and landmark glyphs above the geographic basemap. */
  showContextMarks?: boolean;
  /** Starting point for distances, if the user has set one. */
  anchor?: DiscoveryAnchor | null;
  /** When true, a tap on the map places or moves the manual pin. */
  placingPin?: boolean;
  onPlacePin?: (point: LatLng) => void;
  /** Dedicated-map-only compact label for the selected restaurant marker. */
  showSelectedRestaurantPopup?: boolean;
  /** Called when the interactive map surface, rather than a marker, is pressed. */
  onMapBackgroundClick?: () => void;
  /** Preserve the transform between application surfaces that share this key. */
  viewportSessionKey?: string;
  className?: string;
}

/** A drag shorter than this counts as a tap, not a pan. */
const TAP_SLOP = 6;

/** Wheel delta -> zoom factor. Tuned so a trackpad feels smooth, not jumpy. */
const WHEEL_SENSITIVITY = 0.0015;
const PIN_SPROUT_STATE_MS = 600;
const REVEAL_FIT_PADDING = 120;

function distanceBetween(a: PointerEvent, b: PointerEvent): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * Fiyu's interactive SVG discovery map.
 *
 * All pan and zoom state is a single {x, y, k} transform; the maths lives in
 * lib/map/viewport and is unit-tested there. Because every coordinate is in
 * viewBox units, resizing the container cannot cause drift -- the browser
 * rescales the coordinate system and the transform is untouched.
 *
 * Pointer Events handle mouse, trackpad and touch through one code path, with
 * a second active pointer switching to pinch-zoom.
 */
export function FiyuMap({
  restaurants,
  selectedPlaceId,
  onSelect,
  surfaceMode = "fullscreen",
  interactive = true,
  compactOnMobile = false,
  showContextMarks = true,
  anchor = null,
  placingPin = false,
  onPlacePin,
  showSelectedRestaurantPopup = false,
  onMapBackgroundClick,
  viewportSessionKey,
  className,
}: FiyuMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [initialViewportSession] = useState(() =>
    viewportSessionKey ? readMapViewportSession(viewportSessionKey) : null,
  );
  const [view, setView] = useState<MapView>(
    () => initialViewportSession?.view ?? IDENTITY_VIEW,
  );
  const [sproutingPlaceIds, setSproutingPlaceIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const seenRevealEventIds = useRef(new Set<string>());
  const sproutTimers = useRef<number[]>([]);

  /** Live pointers, for drag and pinch. */
  const pointers = useRef(new Map<number, PointerEvent>());
  const pinchDistance = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Where a gesture started, so a tap can be told apart from a pan. */
  const gestureStart = useRef<{ x: number; y: number } | null>(null);

  /*
   * Only restaurants inside the illustrated area are projected.
   *
   * A coordinate outside TOKYO_BOUNDS does not merely clip: it widens
   * fitToPoints' bounding box, which drags the scale down toward MIN_SCALE and
   * pushes every legitimate pin into a corner. One bad row would degrade the map
   * for the whole catalog, and clampTranslate makes the offender unreachable at
   * k = 1 so there is no way to even see it. DiscoveryShell discloses the count.
   */
  const plotted = useMemo(
    () =>
      restaurants.filter((restaurant) =>
        isWithinBounds({ lat: restaurant.latitude, lng: restaurant.longitude }),
      ),
    [restaurants],
  );

  const points = useMemo(
    () => plotted.map((restaurant) => project({ lat: restaurant.latitude, lng: restaurant.longitude })),
    [plotted],
  );

  const clusters = useMemo(
    () =>
      clusterMarkers(
        plotted.map((restaurant, index) => ({
          id: restaurant.place_id,
          point: points[index],
          item: restaurant,
        })),
        { scale: view.k },
      ),
    [plotted, points, view.k],
  );

  /*
   * Detail level, bucketed from the scale.
   *
   * This is what keeps the base geography off the hot path: it is an integer that
   * panning cannot change and zooming changes at most twice, so MapBase's memo
   * holds across every frame of a drag. See lib/map/detail.ts.
   */
  const detail = detailLevelFor(view.k);

  /**
   * Auto-fit only when the result set materially changes, never after the user
   * has taken control -- re-framing under someone mid-pan is disorienting.
   */
  const resultKey = plotted.map((restaurant) => restaurant.place_id).join("|");
  const plottedPlaceIds = useMemo(
    () => new Set(plotted.map((restaurant) => restaurant.place_id)),
    [plotted],
  );
  const pointByPlaceId = useMemo(
    () => new Map(plotted.map((restaurant, index) => [restaurant.place_id, points[index]])),
    [plotted, points],
  );
  const selectedRestaurant = showSelectedRestaurantPopup
    ? plotted.find((restaurant) => restaurant.place_id === selectedPlaceId) ?? null
    : null;
  const selectedPoint = selectedRestaurant
    ? pointByPlaceId.get(selectedRestaurant.place_id) ?? null
    : null;
  const lastFitKey = useRef<string | null>(
    initialViewportSession?.resultKey === resultKey ? resultKey : null,
  );
  const skipNextViewportSave = useRef(false);
  const userHasInteracted = useRef(false);

  useEffect(() => {
    if (lastFitKey.current === resultKey) return;
    lastFitKey.current = resultKey;
    userHasInteracted.current = false;
    const fitted = points.length > 0 ? fitToPoints(points) : IDENTITY_VIEW;
    skipNextViewportSave.current = true;
    if (viewportSessionKey) {
      saveMapViewportSession(viewportSessionKey, { resultKey, view: fitted });
    }
    setView(fitted);
    // `points` is derived from the same restaurants as resultKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey, viewportSessionKey]);

  useEffect(() => {
    if (!viewportSessionKey || lastFitKey.current !== resultKey) return;
    if (skipNextViewportSave.current) {
      skipNextViewportSave.current = false;
      return;
    }
    saveMapViewportSession(viewportSessionKey, { resultKey, view });
  }, [resultKey, view, viewportSessionKey]);

  useEffect(() => {
    const unsubscribe = subscribeToNewlyRevealedMapPlaces((event) => {
      if (seenRevealEventIds.current.has(event.eventId)) return;
      seenRevealEventIds.current.add(event.eventId);
      const newlyPlotted = event.placeIds.filter((placeId) =>
        plottedPlaceIds.has(placeId),
      );
      if (newlyPlotted.length === 0) return;

      const revealedPoints = event.revealedPlaceIds
        .map((placeId) => pointByPlaceId.get(placeId))
        .filter((point): point is NonNullable<typeof point> => Boolean(point));

      setSproutingPlaceIds((current) => new Set([...current, ...newlyPlotted]));
      setView((current) =>
        fitPointsIfOutsideView(revealedPoints, current, { padding: REVEAL_FIT_PADDING }),
      );
      const timer = window.setTimeout(() => {
        setSproutingPlaceIds((current) => {
          const next = new Set(current);
          for (const placeId of newlyPlotted) next.delete(placeId);
          return next;
        });
        sproutTimers.current = sproutTimers.current.filter((candidate) => candidate !== timer);
      }, PIN_SPROUT_STATE_MS);
      sproutTimers.current.push(timer);
    });

    return () => {
      unsubscribe();
      for (const timer of sproutTimers.current) window.clearTimeout(timer);
      sproutTimers.current = [];
    };
  }, [plottedPlaceIds, pointByPlaceId]);

  const markInteracted = useCallback(() => {
    userHasInteracted.current = true;
    setSproutingPlaceIds((current) => (current.size === 0 ? current : new Set()));
  }, []);

  const toViewBox = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return clientToViewBox(clientX, clientY, rect);
  }, []);

  /*
   * Wheel zoom is registered manually because React's onWheel is passive and
   * cannot preventDefault, which would let the page scroll behind the map.
   */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !interactive) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      markInteracted();
      const factor = Math.exp(-event.deltaY * WHEEL_SENSITIVITY);
      const focus = clientToViewBox(event.clientX, event.clientY, svg.getBoundingClientRect());
      setView((current) => zoomAt(current, factor, focus));
    };

    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [interactive, markInteracted]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!interactive) return;
      // Let marker buttons handle their own activation.
      if ((event.target as Element).closest('[role="button"]')) return;
      if ((event.target as Element).closest('[data-layer="restaurant-popup"]')) return;

      onMapBackgroundClick?.();

      pointers.current.set(event.pointerId, event.nativeEvent);
      event.currentTarget.setPointerCapture(event.pointerId);
      if (pointers.current.size === 1) {
        gestureStart.current = { x: event.clientX, y: event.clientY };
        setDragging(true);
      } else {
        // A second finger turns this into a pinch, never a tap.
        gestureStart.current = null;
      }
    },
    [interactive, onMapBackgroundClick],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!interactive) return;
      const previous = pointers.current.get(event.pointerId);
      if (!previous) return;

      pointers.current.set(event.pointerId, event.nativeEvent);
      const active = [...pointers.current.values()];

      if (active.length >= 2) {
        // Pinch: zoom about the midpoint of the two pointers.
        setDragging(false);
        const [a, b] = active;
        const spread = distanceBetween(a, b);
        if (pinchDistance.current !== null && pinchDistance.current > 0) {
          markInteracted();
          const factor = spread / pinchDistance.current;
          const focus = toViewBox((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
          setView((current) => zoomAt(current, factor, focus));
        }
        pinchDistance.current = spread;
        return;
      }

      // Single pointer: drag. Deltas are converted into viewBox units so the
      // map tracks the cursor exactly at any container size.
      const from = toViewBox(previous.clientX, previous.clientY);
      const to = toViewBox(event.clientX, event.clientY);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      if (dx === 0 && dy === 0) return;

      markInteracted();
      setView((current) => panBy(current, dx, dy));
    },
    [interactive, markInteracted, toViewBox],
  );

  const endPointer = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const start = gestureStart.current;
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) pinchDistance.current = null;
      if (pointers.current.size === 0) setDragging(false);

      // A tap in pin-placement mode drops or moves the starting point. The
      // slop check keeps the end of a pan from placing a pin by accident.
      if (!placingPin || !onPlacePin || !start || event.type !== "pointerup") return;
      const travelled = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      gestureStart.current = null;
      if (travelled > TAP_SLOP) return;

      const inViewBox = toViewBox(event.clientX, event.clientY);
      onPlacePin(unproject(viewBoxToContent(inViewBox, view)));
    },
    [placingPin, onPlacePin, toViewBox, view],
  );

  const fitResults = useCallback(() => {
    markInteracted();
    setView(points.length > 0 ? fitToPoints(points) : IDENTITY_VIEW);
  }, [points, markInteracted]);

  const reset = useCallback(() => {
    markInteracted();
    setView(IDENTITY_VIEW);
  }, [markInteracted]);

  const expandCluster = useCallback(
    (cluster: MarkerCluster<MappableRestaurant>) => {
      markInteracted();
      onMapBackgroundClick?.();
      setView(fitToPoints(cluster.members.map((member) => member.point), { padding: 160 }));
    },
    [markInteracted, onMapBackgroundClick],
  );

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-[var(--map-bg)]", className)}>
      <svg
        ref={svgRef}
        viewBox={VIEWBOX}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={
          plotted.length === 0
            ? "Map of Tokyo. No restaurants are currently mapped."
            : `Map of Tokyo showing ${plotted.length} restaurants.`
        }
        className={cn(
          "h-full w-full",
          placingPin ? "cursor-crosshair" : dragging ? "cursor-grabbing" : "lg:cursor-grab",
          // Let the browser scroll the page vertically while the inline map is
          // not the active surface; capture gestures fully when it is. Expressed
          // as a Tailwind variant rather than a media-query hook so the server
          // and client render the same class list -- see surfaceMode above.
          surfaceMode === "inline" ? "touch-pan-y lg:touch-none" : "touch-none",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={endPointer}
      >
        {/*
          Draw order is deliberate and is the whole basis of the visual
          hierarchy. Geography first, then place names, then context marks, and
          restaurant markers LAST so a pin is never overdrawn by a station,
          landmark or label. Every layer above the markers would be a bug.
        */}
        <g transform={transformFor(view)}>
          <MapBase detail={detail} />
          <g className={compactOnMobile ? "hidden lg:inline" : undefined}>
            <MapLabels scale={view.k} detail={detail} />
            {showContextMarks && <MapStations scale={view.k} detail={detail} />}
            {showContextMarks && <MapLandmarks scale={view.k} detail={detail} />}
          </g>
          {anchor && <AnchorMarker anchor={anchor} scale={view.k} />}
          <MapMarkers
            clusters={clusters}
            selectedPlaceId={selectedPlaceId}
            newlyRevealedPlaceIds={sproutingPlaceIds}
            scale={view.k}
            onSelect={onSelect}
            onExpandCluster={expandCluster}
          />
          {selectedRestaurant && selectedPoint && (
            <MapRestaurantPopup
              restaurant={selectedRestaurant}
              point={selectedPoint}
              view={view}
            />
          )}
        </g>
      </svg>

      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          compactOnMobile && "hidden lg:block",
        )}
      >
        <MapControls
          onZoomIn={() => {
            markInteracted();
            setView((current) => zoomByStep(current, 1));
          }}
          onZoomOut={() => {
            markInteracted();
            setView((current) => zoomByStep(current, -1));
          }}
          onReset={reset}
          onFitResults={fitResults}
          canZoomIn={view.k < MAX_SCALE}
          canZoomOut={view.k > MIN_SCALE}
          canFit={points.length > 0}
        />

        {/*
          Key and data credit. Bottom-left, clear of the controls on the right and
          of the mobile peek sheet at the bottom.
        */}
        <MapLegend className="absolute bottom-3 left-4" />

        {/*
          Announced politely so a screen-reader user knows detail changed with the
          zoom, without it being read as an alert. Visually hidden: sighted users
          can see the map change.
        */}
        <p aria-live="polite" className="sr-only">
          {detailLevelLabel(detail)}. Showing {plotted.length} restaurants.
        </p>
      </div>
    </div>
  );
}

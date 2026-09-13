"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

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
import {
  type MarkerCluster,
  clusterLevelForScale,
  clusterMarkers,
  individualMarkers,
  planClusterExpansion,
  spiderfyMarkers,
} from "@/lib/map/clustering";
import { detailLevelFor, detailLevelLabel } from "@/lib/map/detail";
import { subscribeToNewlyRevealedMapPlaces } from "@/lib/map/revealEvents";
import { readMapViewportSession, saveMapViewportSession } from "@/lib/map/viewportSession";
import {
  type LatLng,
  type Point,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
  isWithinBounds,
  project,
  unproject,
} from "@/lib/map/projection";
import {
  IDENTITY_VIEW,
  MAX_SCALE,
  MIN_SCALE,
  ZOOM_STEP,
  type MapView,
  centerPointsAtScale,
  clientToViewBox,
  fitPointsIfOutsideView,
  fitToPoints,
  normalizeView,
  panBy,
  viewBoxFor,
  viewForSelectedPoint,
  viewBoxToContent,
  viewsEqual,
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
  /** Keep every restaurant individually selectable instead of grouping nearby pins. */
  clusterNearbyRestaurants?: boolean;
  /** Called when the interactive map surface, rather than a marker, is pressed. */
  onMapBackgroundClick?: () => void;
  /** Preserve the transform between application surfaces that share this key. */
  viewportSessionKey?: string;
  /** Keep the current camera when presentation-only filtering changes markers. */
  preserveViewportOnRestaurantChange?: boolean;
  className?: string;
}

/** A drag shorter than this counts as a tap, not a pan. */
const TAP_SLOP = 6;

/** Wheel delta -> zoom factor. Tuned so a trackpad feels smooth, not jumpy. */
const WHEEL_SENSITIVITY = 0.0015;
const PIN_SPROUT_STATE_MS = 600;
const REVEAL_FIT_PADDING = 120;
const SELECTION_TRANSITION_MIN_MS = 520;
const SELECTION_TRANSITION_MAX_MS = 840;
const CLUSTER_TRANSITION_MS = 680;
const CLUSTER_MIN_ZOOM_FACTOR = 1.35;
const CLUSTER_MIN_ZOOM_STEP = 0.5;
/** Quiet period after wheel/pinch input before adopting a new cluster level. */
const CLUSTER_ZOOM_SETTLE_MS = 120;
const DOUBLE_TAP_WINDOW_MS = 320;
const DOUBLE_TAP_SLOP = 24;

type ClusterActivationPhase = "expanding" | "handoff" | "settled";

interface ClusterActivation {
  key: string;
  resultKey: string;
  phase: ClusterActivationPhase;
  mode: "separable" | "spiderfy";
  memberIds: readonly string[];
  members: MarkerCluster<MappableRestaurant>["members"];
  centroid: Point;
  targetView: MapView;
  reducedMotion: boolean;
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

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
  clusterNearbyRestaurants = true,
  onMapBackgroundClick,
  viewportSessionKey,
  preserveViewportOnRestaurantChange = false,
  className,
}: FiyuMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerSize, setContainerSize] = useState({
    width: VIEWBOX_WIDTH,
    height: VIEWBOX_HEIGHT,
  });
  const [initialViewportSession] = useState(() =>
    viewportSessionKey ? readMapViewportSession(viewportSessionKey) : null,
  );
  const [view, setView] = useState<MapView>(
    () => initialViewportSession?.view ?? IDENTITY_VIEW,
  );
  const [clusterLevel, setClusterLevel] = useState(() =>
    clusterLevelForScale(initialViewportSession?.view.k ?? IDENTITY_VIEW.k),
  );
  const viewRef = useRef(view);
  const viewAnimation = useRef<number | null>(null);
  const viewAnimationCompletion = useRef<((settled: boolean) => void) | null>(null);
  const lastAutoSelection = useRef<string | null>(null);
  const [sproutingPlaceIds, setSproutingPlaceIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [clusterActivation, setClusterActivation] = useState<ClusterActivation | null>(null);
  const clusterExpansionInFlight = useRef(false);
  const seenRevealEventIds = useRef(new Set<string>());
  const sproutTimers = useRef<number[]>([]);

  /** Live pointers, for drag and pinch. */
  const pointers = useRef(new Map<number, PointerEvent>());
  const pinchDistance = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Where a gesture started, so a tap can be told apart from a pan. */
  const gestureStart = useRef<{ x: number; y: number } | null>(null);
  const lastTouchTap = useRef<{ at: number; x: number; y: number } | null>(null);
  const lastTouchZoomAt = useRef(0);

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
  const resultKey = [...plotted]
    .map((restaurant) => restaurant.place_id)
    .sort()
    .join("|");
  const [clusterInteractionResultKey, setClusterInteractionResultKey] = useState(resultKey);
  if (clusterInteractionResultKey !== resultKey) {
    setClusterInteractionResultKey(resultKey);
    setClusterActivation(null);
  }
  const activeClusterActivation = clusterActivation?.resultKey === resultKey
    ? clusterActivation
    : null;

  const clusterInputs = useMemo(
    () => plotted.map((restaurant, index) => ({
      id: restaurant.place_id,
      point: points[index],
      item: restaurant,
    })).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    [plotted, points],
  );
  const clusteredMarkers = useMemo(
    () => clusterMarkers(clusterInputs, { scale: clusterLevel }),
    [clusterInputs, clusterLevel],
  );
  const unclusteredMarkers = useMemo(
    () => individualMarkers(clusterInputs, { scale: view.k }),
    [clusterInputs, view.k],
  );
  const stableClusters = clusterNearbyRestaurants ? clusteredMarkers : unclusteredMarkers;
  const activeMemberIds = activeClusterActivation?.memberIds ?? null;
  const activeClusterPartition = useMemo(() => {
    if (!activeMemberIds || !clusterNearbyRestaurants) return null;

    const activatedIds = new Set(activeMemberIds);
    const activated = clusterInputs.filter((input) => activatedIds.has(input.id));
    const remaining = clusterInputs.filter((input) => !activatedIds.has(input.id));
    return {
      activated,
      background: clusterMarkers(remaining, { scale: clusterLevel }),
    };
  }, [activeMemberIds, clusterInputs, clusterLevel, clusterNearbyRestaurants]);
  const clusters = useMemo(() => {
    if (!activeClusterActivation || !activeClusterPartition) return stableClusters;
    if (activeClusterActivation.phase === "expanding") return activeClusterPartition.background;
    return [
      ...activeClusterPartition.background,
      ...(activeClusterActivation.mode === "spiderfy"
        ? spiderfyMarkers(activeClusterPartition.activated, { scale: view.k })
        : individualMarkers(activeClusterPartition.activated, { scale: view.k })),
    ];
  }, [activeClusterActivation, activeClusterPartition, stableClusters, view.k]);

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
  const hasFittedResults = useRef(
    initialViewportSession?.resultKey === resultKey,
  );
  const skipNextViewportSave = useRef(false);
  const userHasInteracted = useRef(false);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  /*
   * Wheel and pinch update the camera continuously, but cluster membership is
   * adopted only after input settles. Panning cannot reach this effect because
   * its scale is unchanged. Programmatic animations commit their final level
   * explicitly below, so this timer is never their completion mechanism.
   */
  useEffect(() => {
    const nextLevel = clusterLevelForScale(view.k);
    if (nextLevel === clusterLevel) return;
    let timer = 0;
    const commitWhenSettled = () => {
      if (viewAnimation.current !== null) {
        timer = window.setTimeout(commitWhenSettled, CLUSTER_ZOOM_SETTLE_MS);
        return;
      }
      setClusterLevel(nextLevel);
    };
    timer = window.setTimeout(commitWhenSettled, CLUSTER_ZOOM_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [clusterLevel, view.k]);

  const cancelViewAnimation = useCallback((notifyCancellation = true) => {
    if (viewAnimation.current !== null) {
      window.cancelAnimationFrame(viewAnimation.current);
      viewAnimation.current = null;
    }
    const completion = viewAnimationCompletion.current;
    viewAnimationCompletion.current = null;
    if (notifyCancellation) {
      const settled = viewRef.current;
      setView(settled);
      setClusterLevel(clusterLevelForScale(settled.k));
      completion?.(false);
    }
  }, []);

  const animateToView = useCallback((
    target: MapView,
    duration: number,
    onComplete?: (settled: boolean) => void,
    commitBeforeComplete = false,
  ) => {
    cancelViewAnimation();
    const start = viewRef.current;
    if (viewsEqual(start, target)) {
      if (commitBeforeComplete) {
        flushSync(() => {
          setView(target);
          setClusterLevel(clusterLevelForScale(target.k));
          onComplete?.(true);
        });
      } else {
        setView(target);
        setClusterLevel(clusterLevelForScale(target.k));
        onComplete?.(true);
      }
      return;
    }
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    if (reducedMotion || typeof window.requestAnimationFrame !== "function") {
      viewRef.current = target;
      if (commitBeforeComplete) {
        flushSync(() => {
          setView(target);
          setClusterLevel(clusterLevelForScale(target.k));
          onComplete?.(true);
        });
      } else {
        setView(target);
        setClusterLevel(clusterLevelForScale(target.k));
        onComplete?.(true);
      }
      return;
    }

    viewAnimationCompletion.current = onComplete ?? null;
    let startedAt: number | null = null;
    const tick = (now: number) => {
      startedAt ??= now;
      const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
      const eased = easeOutCubic(progress);
      const next = progress === 1
        ? target
        : normalizeView({
            x: start.x + (target.x - start.x) * eased,
            y: start.y + (target.y - start.y) * eased,
            k: start.k + (target.k - start.k) * eased,
          });
      viewRef.current = next;
      if (progress < 1) {
        setView(next);
        viewAnimation.current = window.requestAnimationFrame(tick);
      } else {
        viewAnimation.current = null;
        const completion = viewAnimationCompletion.current;
        viewAnimationCompletion.current = null;
        if (commitBeforeComplete) {
          // The final transform and the expansion phase that exposes leaf pins
          // belong to one authoritative React commit. No later pointer, resize
          // or animation frame is needed to synchronize declarative SVG state.
          flushSync(() => {
            setView(next);
            setClusterLevel(clusterLevelForScale(next.k));
            completion?.(true);
          });
        } else {
          setView(next);
          setClusterLevel(clusterLevelForScale(next.k));
          completion?.(true);
        }
      }
    };
    viewAnimation.current = window.requestAnimationFrame(tick);
  }, [cancelViewAnimation]);

  useEffect(() => () => cancelViewAnimation(false), [cancelViewAnimation]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (lastFitKey.current === resultKey) return;
    lastFitKey.current = resultKey;
    if (preserveViewportOnRestaurantChange && hasFittedResults.current) return;
    hasFittedResults.current = true;
    userHasInteracted.current = false;
    const fitted = points.length > 0 ? fitToPoints(points) : IDENTITY_VIEW;
    cancelViewAnimation();
    viewRef.current = fitted;
    skipNextViewportSave.current = true;
    if (viewportSessionKey) {
      saveMapViewportSession(viewportSessionKey, { resultKey, view: fitted });
    }
    setView(fitted);
    setClusterLevel(clusterLevelForScale(fitted.k));
    // `points` is derived from the same restaurants as resultKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelViewAnimation, preserveViewportOnRestaurantChange, resultKey, viewportSessionKey]);

  useEffect(() => {
    cancelViewAnimation(false);
    clusterExpansionInFlight.current = false;
  }, [cancelViewAnimation, resultKey]);

  useEffect(() => {
    if (!selectedPlaceId) {
      lastAutoSelection.current = null;
      return;
    }
    if (lastAutoSelection.current === selectedPlaceId) return;
    const point = pointByPlaceId.get(selectedPlaceId);
    const container = containerRef.current;
    if (!point || !container) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : containerSize.width;
    const height = rect.height > 0 ? rect.height : containerSize.height;
    const renderedScale = Math.max(
      0.001,
      Math.min(width / VIEWBOX_WIDTH, height / VIEWBOX_HEIGHT),
    );
    const px = (value: number) => value / renderedScale;
    const popupShown = showSelectedRestaurantPopup;
    const insets = surfaceMode === "fullscreen"
      ? {
          top: px(popupShown ? 194 : 92),
          right: px(22),
          bottom: px(popupShown ? 104 : 88),
          left: px(22),
        }
      : surfaceMode === "bounded"
        ? {
            top: px(popupShown ? 194 : 28),
            right: px(82),
            bottom: px(30),
            left: px(28),
          }
        : { top: px(20), right: px(20), bottom: px(20), left: px(20) };
    const current = viewRef.current;
    const target = viewForSelectedPoint(point, current, { insets });
    lastAutoSelection.current = selectedPlaceId;
    if (viewsEqual(current, target)) return;

    const panDistance = Math.hypot(target.x - current.x, target.y - current.y);
    const zoomDistance = Math.abs(target.k - current.k) * 180;
    const duration = Math.min(
      SELECTION_TRANSITION_MAX_MS,
      Math.max(SELECTION_TRANSITION_MIN_MS, 500 + (panDistance + zoomDistance) * 0.16),
    );
    animateToView(target, duration);
  }, [
    animateToView,
    containerSize.height,
    containerSize.width,
    pointByPlaceId,
    selectedPlaceId,
    showSelectedRestaurantPopup,
    surfaceMode,
  ]);

  useEffect(() => {
    if (!viewportSessionKey || lastFitKey.current !== resultKey) return;
    // Persist the settled endpoint, not every animation frame. Synchronous
    // storage writes during motion are exactly the kind of main-thread work
    // that can turn a restrained transition into visible judder.
    if (viewAnimation.current !== null) return;
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
    cancelViewAnimation();
    userHasInteracted.current = true;
    setClusterActivation(null);
    setSproutingPlaceIds((current) => (current.size === 0 ? current : new Set()));
  }, [cancelViewAnimation]);

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
      const factor = Math.exp(-event.deltaY * WHEEL_SENSITIVITY);
      const focus = clientToViewBox(event.clientX, event.clientY, svg.getBoundingClientRect());
      markInteracted();
      const next = zoomAt(viewRef.current, factor, focus);
      if (viewsEqual(viewRef.current, next)) return;
      viewRef.current = next;
      setView(next);
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

      markInteracted();
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
    [interactive, markInteracted, onMapBackgroundClick],
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
          const factor = spread / pinchDistance.current;
          const focus = toViewBox((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
          const next = zoomAt(viewRef.current, factor, focus);
          if (!viewsEqual(viewRef.current, next)) {
            markInteracted();
            viewRef.current = next;
            setView(next);
          }
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

      const next = panBy(viewRef.current, dx, dy);
      if (viewsEqual(viewRef.current, next)) return;
      markInteracted();
      viewRef.current = next;
      setView(next);
    },
    [interactive, markInteracted, toViewBox],
  );

  const endPointer = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const start = gestureStart.current;
      const wasTracked = pointers.current.has(event.pointerId);
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) pinchDistance.current = null;
      if (pointers.current.size === 0) setDragging(false);

      if (!wasTracked) return;
      const travelled = start
        ? Math.hypot(event.clientX - start.x, event.clientY - start.y)
        : TAP_SLOP + 1;
      gestureStart.current = null;

      if (
        event.type === "pointerup" &&
        !placingPin &&
        travelled <= TAP_SLOP &&
        (event.pointerType === "touch" || event.pointerType === "pen")
      ) {
        const previous = lastTouchTap.current;
        const now = Date.now();
        if (
          previous &&
          now - previous.at <= DOUBLE_TAP_WINDOW_MS &&
          Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= DOUBLE_TAP_SLOP
        ) {
          lastTouchTap.current = null;
          lastTouchZoomAt.current = now;
          const focus = toViewBox(event.clientX, event.clientY);
          const next = zoomAt(viewRef.current, ZOOM_STEP, focus);
          markInteracted();
          viewRef.current = next;
          setView(next);
          setClusterLevel(clusterLevelForScale(next.k));
          return;
        }
        lastTouchTap.current = { at: now, x: event.clientX, y: event.clientY };
      } else if (travelled > TAP_SLOP) {
        lastTouchTap.current = null;
      }

      // A tap in pin-placement mode drops or moves the starting point. The
      // slop check keeps the end of a pan from placing a pin by accident.
      if (!placingPin || !onPlacePin || !start || event.type !== "pointerup") return;
      if (travelled > TAP_SLOP) return;

      const inViewBox = toViewBox(event.clientX, event.clientY);
      onPlacePin(unproject(viewBoxToContent(inViewBox, view)));
    },
    [markInteracted, placingPin, onPlacePin, toViewBox, view],
  );

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!interactive || placingPin) return;
      // Some mobile browsers synthesize a mouse dblclick after the two pointer
      // taps. The pointer path already committed this gesture to the canonical
      // camera, so ignore only that immediate compatibility event.
      if (Date.now() - lastTouchZoomAt.current <= DOUBLE_TAP_WINDOW_MS) return;
      if ((event.target as Element).closest('[role="button"]')) return;
      if ((event.target as Element).closest('[data-layer="restaurant-popup"]')) return;
      event.preventDefault();
      const focus = toViewBox(event.clientX, event.clientY);
      const next = zoomAt(viewRef.current, ZOOM_STEP, focus);
      markInteracted();
      viewRef.current = next;
      setView(next);
      setClusterLevel(clusterLevelForScale(next.k));
    },
    [interactive, markInteracted, placingPin, toViewBox],
  );

  const fitResults = useCallback(() => {
    markInteracted();
    const next = points.length > 0 ? fitToPoints(points) : IDENTITY_VIEW;
    viewRef.current = next;
    setView(next);
    setClusterLevel(clusterLevelForScale(next.k));
  }, [points, markInteracted]);

  const reset = useCallback(() => {
    markInteracted();
    viewRef.current = IDENTITY_VIEW;
    setView(IDENTITY_VIEW);
    setClusterLevel(clusterLevelForScale(IDENTITY_VIEW.k));
  }, [markInteracted]);

  const expandCluster = useCallback(
    (cluster: MarkerCluster<MappableRestaurant>) => {
      if (clusterExpansionInFlight.current) return;
      markInteracted();
      onMapBackgroundClick?.();
      const currentScale = viewRef.current.k;
      const minimumScale = Math.min(
        MAX_SCALE,
        Math.max(
          currentScale * CLUSTER_MIN_ZOOM_FACTOR,
          currentScale + CLUSTER_MIN_ZOOM_STEP,
        ),
      );
      const plan = planClusterExpansion(cluster.members, {
        currentScale,
        maxScale: MAX_SCALE,
        minimumScale,
      });
      const targetView = centerPointsAtScale(
        cluster.members.map((member) => member.point),
        plan.targetScale,
      );
      const activationKey = `${resultKey}:${cluster.members.map((member) => member.id).join("|")}`;
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
      clusterExpansionInFlight.current = true;
      setClusterActivation({
        key: activationKey,
        resultKey,
        phase: "expanding",
        mode: plan.mode,
        memberIds: cluster.members.map((member) => member.id),
        members: cluster.members,
        centroid: cluster.point,
        targetView,
        reducedMotion,
      });
      animateToView(
        targetView,
        CLUSTER_TRANSITION_MS,
        (settled) => {
          clusterExpansionInFlight.current = false;
          setClusterActivation((current) => {
            if (!current || current.key !== activationKey) return current;
            if (!settled) return null;
            if (current.reducedMotion && current.mode === "separable") return null;
            return { ...current, phase: current.reducedMotion ? "settled" : "handoff" };
          });
        },
        true,
      );
    },
    [animateToView, markInteracted, onMapBackgroundClick, resultKey],
  );

  const clusterButtonPosition = useCallback(
    (cluster: MarkerCluster<MappableRestaurant>) => {
      const renderedScale = Math.min(
        containerSize.width / VIEWBOX_WIDTH,
        containerSize.height / VIEWBOX_HEIGHT,
      );
      const renderedWidth = VIEWBOX_WIDTH * renderedScale;
      const renderedHeight = VIEWBOX_HEIGHT * renderedScale;
      return {
        left:
          (containerSize.width - renderedWidth) / 2 +
          (cluster.point.x * view.k + view.x) * renderedScale,
        top:
          (containerSize.height - renderedHeight) / 2 +
          (cluster.point.y * view.k + view.y) * renderedScale,
      };
    },
    [containerSize.height, containerSize.width, view],
  );

  return (
    <div ref={containerRef} className={cn("relative h-full w-full overflow-hidden bg-[var(--map-bg)]", className)}>
      <svg
        ref={svgRef}
        viewBox={viewBoxFor(view)}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        data-cluster-level={clusterLevel}
        data-camera-scale={view.k}
        data-camera-x={view.x}
        data-camera-y={view.y}
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
        onDoubleClick={handleDoubleClick}
      >
        {/*
          Draw order is deliberate and is the whole basis of the visual
          hierarchy. Geography first, then place names, then context marks, and
          restaurant markers LAST so a pin is never overdrawn by a station,
          landmark or label. Every layer above the markers would be a bug.
        */}
        <g data-map-content="true">
          <MapBase detail={detail} />
          <g className={compactOnMobile ? "hidden lg:inline" : undefined}>
            <MapLabels scale={view.k} detail={detail} />
            {showContextMarks && <MapStations scale={view.k} detail={detail} />}
            {showContextMarks && <MapLandmarks scale={view.k} detail={detail} />}
          </g>
          {anchor && <AnchorMarker anchor={anchor} scale={view.k} />}
          <MapMarkers
            clusters={clusters}
            activeCluster={activeClusterActivation ? {
              cluster: {
                id: `active:${activeClusterActivation.key}`,
                point: activeClusterActivation.centroid,
                members: activeClusterActivation.members,
              },
              phase: activeClusterActivation.phase,
              onHandoffComplete: () => {
                setClusterActivation((current) =>
                  current?.key === activeClusterActivation.key && current.phase === "handoff"
                    ? current.mode === "separable"
                      ? null
                      : { ...current, phase: "settled" }
                    : current,
                );
              },
            } : null}
            selectedPlaceId={selectedPlaceId}
            newlyRevealedPlaceIds={sproutingPlaceIds}
            appearingPlaceIds={
              activeClusterActivation?.phase === "handoff"
                ? new Set(activeClusterActivation.memberIds)
                : new Set()
            }
            scale={view.k}
            onSelect={onSelect}
          />
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-0 z-10" aria-label="Restaurant clusters">
        {clusters.filter((cluster) => cluster.members.length > 1).map((cluster) => {
          const position = clusterButtonPosition(cluster);
          return (
            <button
              key={cluster.id}
              type="button"
              aria-label={`${cluster.members.length} restaurants in this area. Activate to zoom in.`}
              data-marker-kind="restaurant-cluster"
              data-cluster-id={cluster.id}
              data-place-ids={cluster.members.map((member) => member.item.place_id).join(",")}
              onClick={() => expandCluster(cluster)}
              className="pointer-events-auto absolute size-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-transparent text-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--map-marker)]"
              style={{ left: position.left, top: position.top }}
            >
              <span className="sr-only">{cluster.members.length}</span>
            </button>
          );
        })}
      </div>

      {selectedRestaurant && selectedPoint && (
        <MapRestaurantPopup
          restaurant={selectedRestaurant}
          point={selectedPoint}
          view={view}
          containerWidth={containerSize.width}
          containerHeight={containerSize.height}
        />
      )}

      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          compactOnMobile && "hidden lg:block",
        )}
      >
        <MapControls
          onZoomIn={() => {
            markInteracted();
            const next = zoomByStep(viewRef.current, 1);
            viewRef.current = next;
            setView(next);
            setClusterLevel(clusterLevelForScale(next.k));
          }}
          onZoomOut={() => {
            markInteracted();
            const next = zoomByStep(viewRef.current, -1);
            viewRef.current = next;
            setView(next);
            setClusterLevel(clusterLevelForScale(next.k));
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

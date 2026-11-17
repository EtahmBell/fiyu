import type { MapRestaurant } from "@fiyu/contracts";
import { memo, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent, type NativeTouchEvent } from "react-native";
import Svg, { Circle, G, Path, Rect, Text as SvgText } from "react-native-svg";

import { clusterMarkers, planClusterExpansion, spiderfyMarkers, type ClusterInput, type MarkerCluster } from "@/lib/map/clustering";
import { mapGeography } from "@/lib/map/geography";
import { MARKER_COLORS, markerState } from "@/lib/map/personalMap";
import { isWithinBounds, project, VIEWBOX_HEIGHT, VIEWBOX_WIDTH, type Point } from "@/lib/map/projection";
import { centerPointsAtScale, fitToPoints, IDENTITY_VIEW, MAX_SCALE, MIN_SCALE, panBy, pinchView, viewBoxFor, zoomByStep, type MapView } from "@/lib/map/viewport";

const OUTLINE = "#403B46";
const LABELS = [
  ["Shinjuku", 35.6938, 139.7034], ["Shibuya", 35.6618, 139.7041], ["Chiyoda", 35.694, 139.7536],
  ["Chuo", 35.6706, 139.772], ["Minato", 35.6581, 139.7514], ["Taito", 35.7126, 139.78],
  ["Toshima", 35.7364, 139.7159], ["Suginami", 35.6994, 139.6363], ["Setagaya", 35.6464, 139.6532],
  ["Koto", 35.6729, 139.8172], ["Ota", 35.5614, 139.716], ["Adachi", 35.7756, 139.8044],
] as const;

function strongestColor(rows: readonly MapRestaurant[]) {
  const rank = ["personalized", "my_pick", "recent", "visited", "saved", "default"] as const;
  return MARKER_COLORS[rank.find((state) => rows.some((row) => markerState(row) === state)) ?? "default"];
}

const Basemap = memo(function Basemap({ detail }: { detail: number }) {
  return <G>
    <Rect x={0} y={0} width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="#F4EFE7" />
    <Path d={mapGeography.wards} fill="none" stroke="#CFC4DB" strokeWidth={0.75} opacity={0.55} />
    <Path d={mapGeography.parks} fill="#E7E2D8" fillRule="evenodd" />
    <Path d={mapGeography.bay} fill="#DED5F5" />
    <Path d={mapGeography.water} fill="#DED5F5" fillRule="evenodd" />
    <Path d={mapGeography.waterways} fill="none" stroke="#DED5F5" strokeWidth={2.5} strokeLinecap="round" />
    {detail >= 2 ? <Path d={mapGeography.roadsSecondary} fill="none" stroke="#E8E1E9" strokeWidth={0.9} /> : null}
    <Path d={mapGeography.roadsMajor} fill="none" stroke="#D8CEE2" strokeWidth={1.4} />
    <Path d={mapGeography.railSurface} fill="none" stroke="#CFC4DB" strokeWidth={1.6} strokeDasharray="6 3" />
    {detail >= 2 ? <Path d={mapGeography.railSubway} fill="none" stroke="#B9AECD" strokeWidth={1} strokeDasharray="2 3" /> : null}
  </G>;
});

/** Match SVG's xMidYMid meet mapping for phone-shaped map surfaces. */
function touchPoint(touch: NativeTouchEvent, width: number, height: number): Point {
  const scale = Math.max(0.001, Math.min(width / VIEWBOX_WIDTH, height / VIEWBOX_HEIGHT));
  const offsetX = (width - VIEWBOX_WIDTH * scale) / 2;
  const offsetY = (height - VIEWBOX_HEIGHT * scale) / 2;
  return { x: (touch.locationX - offsetX) / scale, y: (touch.locationY - offsetY) / scale };
}

export interface NativeFiyuMapProps {
  restaurants: MapRestaurant[];
  selectedPlaceId: string | null;
  onSelect(restaurant: MapRestaurant): void;
  onBackgroundPress(): void;
  userLocation?: { latitude: number; longitude: number } | null;
}

export function NativeFiyuMap({ restaurants, selectedPlaceId, onSelect, onBackgroundPress, userLocation }: NativeFiyuMapProps) {
  const inputs = useMemo<ClusterInput<MapRestaurant>[]>(() => restaurants
    .filter((item) => item.latitude !== null && item.longitude !== null && isWithinBounds({ lat: item.latitude, lng: item.longitude }))
    .map((item) => ({ id: item.place_id, point: project({ lat: item.latitude!, lng: item.longitude! }), item }))
    .sort((left, right) => left.id.localeCompare(right.id)), [restaurants]);
  const [view, setViewState] = useState<MapView>(() => fitToPoints(inputs.map((input) => input.point)));
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [spider, setSpider] = useState<string | null>(null);
  const viewRef = useRef(view);
  const gesture = useRef<{ view: MapView; midpoint?: Point; distance?: number; single?: Point }>({ view });
  const setView = (next: MapView) => { viewRef.current = next; setViewState(next); };
  const baseClusters = useMemo(() => clusterMarkers(inputs, view.k), [inputs, view.k]);
  const clusters = useMemo(() => {
    if (!spider) return baseClusters;
    const active = baseClusters.find((cluster) => cluster.id === spider);
    return active ? [...baseClusters.filter((cluster) => cluster.id !== spider), ...spiderfyMarkers(active.members, view.k)] : baseClusters;
  }, [baseClusters, spider, view.k]);
  const detail = view.k >= 3 ? 3 : view.k >= 2 ? 2 : 1;

  const beginGesture = (event: GestureResponderEvent) => {
    setSpider(null);
    const touches = event.nativeEvent.touches;
    const start: { view: MapView; midpoint?: Point; distance?: number; single?: Point } = { view: viewRef.current };
    if (touches.length >= 2) {
      const a = touchPoint(touches[0], size.width, size.height); const b = touchPoint(touches[1], size.width, size.height);
      start.midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; start.distance = Math.hypot(a.x - b.x, a.y - b.y);
    } else if (touches[0]) start.single = touchPoint(touches[0], size.width, size.height);
    gesture.current = start;
  };
  const moveGesture = (event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;
    if (touches.length >= 2 && gesture.current.midpoint && gesture.current.distance) {
      const a = touchPoint(touches[0], size.width, size.height); const b = touchPoint(touches[1], size.width, size.height);
      setView(pinchView(gesture.current.view, gesture.current.midpoint, gesture.current.distance, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, Math.hypot(a.x - b.x, a.y - b.y)));
    } else if (touches[0] && gesture.current.single) {
      const current = touchPoint(touches[0], size.width, size.height);
      setView(panBy(gesture.current.view, current.x - gesture.current.single.x, current.y - gesture.current.single.y));
    }
  };

  const activateCluster = (cluster: MarkerCluster<MapRestaurant>) => {
    if (cluster.members.length === 1) { onSelect(cluster.members[0].item); return; }
    const plan = planClusterExpansion(cluster.members, viewRef.current.k, MAX_SCALE);
    if (plan.mode === "spiderfy") {
      if (viewRef.current.k < MAX_SCALE) setView(centerPointsAtScale(cluster.members.map((member) => member.point), MAX_SCALE));
      setSpider(cluster.id);
      return;
    }
    setSpider(null);
    setView(centerPointsAtScale(cluster.members.map((member) => member.point), plan.targetScale));
  };
  const recenter = () => { setSpider(null); setView(inputs.length ? fitToPoints(inputs.map((input) => input.point)) : IDENTITY_VIEW); };
  const onLayout = (event: LayoutChangeEvent) => setSize(event.nativeEvent.layout);

  return <View testID="native-fiyu-map" style={styles.root}>
    <View testID="map-surface" style={styles.mapSurface} onLayout={onLayout} onStartShouldSetResponder={() => false} onMoveShouldSetResponder={() => true} onResponderGrant={beginGesture} onResponderMove={moveGesture}>
      <Svg testID="map-svg" width="100%" height="100%" viewBox={viewBoxFor(view)} preserveAspectRatio="xMidYMid meet" onPress={onBackgroundPress}>
        <Basemap detail={detail} />
        {userLocation && isWithinBounds({ lat: userLocation.latitude, lng: userLocation.longitude }) ? (() => { const point = project({ lat: userLocation.latitude, lng: userLocation.longitude }); return <G {...(Platform.OS === "web" ? {} : { accessible: true })} accessibilityLabel="Your discovery location"><Circle cx={point.x} cy={point.y} r={9 / view.k} fill="#FFFFFF" stroke="#5A3F78" strokeWidth={2 / view.k} /><Circle cx={point.x} cy={point.y} r={3 / view.k} fill="#5A3F78" /></G>; })() : null}
        {detail < 3 ? LABELS.map(([label, lat, lng]) => { const point = project({ lat, lng }); const muted = ["Toshima", "Suginami", "Setagaya", "Koto", "Ota", "Adachi"].includes(label); return <SvgText key={label} x={point.x} y={point.y} fill="#706876" opacity={detail === 1 ? 0.9 : 0.5} fontSize={(muted ? 13 : 15) / view.k} letterSpacing={1.2 / view.k} textAnchor="middle">{label}</SvgText>; }) : null}
        {clusters.map((cluster) => {
          const selected = cluster.members.some((member) => member.id === selectedPlaceId);
          const color = strongestColor(cluster.members.map((member) => member.item));
          const personalized = cluster.members.length === 1 && markerState(cluster.members[0].item) === "personalized";
          const visited = cluster.members.length === 1 && markerState(cluster.members[0].item) === "visited";
          const radius = (cluster.members.length > 1 ? 17 : selected ? 12.5 : personalized ? 12 : visited ? 10 : 11) / view.k;
          const label = cluster.members.length > 1 ? `${cluster.members.length} restaurants in this area` : cluster.members[0].item.name_ja ?? cluster.members[0].item.name_en ?? "Restaurant";
          return <G key={cluster.id} testID={cluster.members.length === 1 ? `map-marker-${cluster.members[0].id}` : `map-cluster-${cluster.id}`} {...(Platform.OS === "web" ? {} : { accessible: true, accessibilityRole: "button" as const })} accessibilityLabel={label} onPress={(event) => { event.stopPropagation(); activateCluster(cluster); }}>
            {selected ? <Circle testID={`map-marker-halo-${cluster.members[0].id}`} cx={cluster.point.x} cy={cluster.point.y} r={18 / view.k} fill={color} opacity={0.28} /> : null}
            <Circle cx={cluster.point.x} cy={cluster.point.y} r={22 / view.k} fill="transparent" />
            <Circle testID={cluster.members.length === 1 ? `map-marker-visual-${cluster.members[0].id}` : `map-cluster-visual-${cluster.id}`} cx={cluster.point.x} cy={cluster.point.y} r={radius} fill={color} stroke={OUTLINE} strokeWidth={(selected ? 2.5 : cluster.members.length > 1 ? 2 : 1.75) / view.k} />
            {cluster.members.length > 1 ? <SvgText x={cluster.point.x} y={cluster.point.y + 4 / view.k} fill="#FFF9EF" fontSize={13 / view.k} fontWeight="600" textAnchor="middle">{cluster.members.length}</SvgText> : null}
          </G>;
        })}
      </Svg>
    </View>
    <View testID="map-controls" style={styles.zoomControls}>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" accessibilityState={{ disabled: view.k >= MAX_SCALE }} disabled={view.k >= MAX_SCALE} onPress={() => { setSpider(null); setView(zoomByStep(viewRef.current, 1)); }} style={styles.zoomButton}><Text style={styles.zoomText}>+</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" accessibilityState={{ disabled: view.k <= MIN_SCALE }} disabled={view.k <= MIN_SCALE} onPress={() => { setSpider(null); setView(zoomByStep(viewRef.current, -1)); }} style={styles.zoomButton}><Text style={styles.zoomText}>−</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Recenter map" onPress={recenter} style={[styles.zoomButton, styles.lastZoomButton]}><Text style={styles.resetText}>⌂</Text></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden", backgroundColor: "#F4EFE7" },
  mapSurface: { flex: 1, width: "100%", backgroundColor: "#F4EFE7" },
  zoomControls: { position: "absolute", top: 12, right: 12, overflow: "hidden", borderWidth: 1, borderColor: "#E6E1E9", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.94)", shadowColor: "#19171D", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 },
  zoomButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E6E1E9" }, lastZoomButton: { borderBottomWidth: 0 },
  zoomText: { color: "#443A78", fontSize: 23, lineHeight: 25 }, resetText: { color: "#443A78", fontSize: 17 },
});

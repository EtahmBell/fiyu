import type { MapRestaurant } from "@fiyu/contracts";
import { memo, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent, type NativeTouchEvent } from "react-native";
import Svg, { Circle, G, Path, Rect, Text as SvgText } from "react-native-svg";

import { clusterMarkers, spiderfyMarkers, type ClusterInput, type MarkerCluster } from "@/lib/map/clustering";
import { mapGeography } from "@/lib/map/geography";
import { MARKER_COLORS, markerState } from "@/lib/map/personalMap";
import { project, VIEWBOX_HEIGHT, VIEWBOX_WIDTH, type Point } from "@/lib/map/projection";
import { IDENTITY_VIEW, MAX_SCALE, panBy, pinchView, viewBoxFor, zoomAt, type MapView } from "@/lib/map/viewport";

const OUTLINE = "#403B46";
const LABELS = [
  ["Shinjuku", 35.6938, 139.7034], ["Shibuya", 35.6618, 139.7041], ["Chiyoda", 35.694, 139.7536],
  ["Minato", 35.6581, 139.7514], ["Taito", 35.7126, 139.78], ["Suginami", 35.6994, 139.6363],
] as const;

function strongestColor(rows: readonly MapRestaurant[]) {
  const rank = ["personalized", "my_pick", "recent", "visited", "saved", "default"] as const;
  return MARKER_COLORS[rank.find((state) => rows.some((row) => markerState(row) === state)) ?? "default"];
}

const Basemap = memo(function Basemap({ detail }: { detail: number }) {
  return <G accessible={false}>
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

function touchPoint(touch: NativeTouchEvent, width: number, height: number): Point {
  return { x: touch.locationX * VIEWBOX_WIDTH / Math.max(1, width), y: touch.locationY * VIEWBOX_HEIGHT / Math.max(1, height) };
}

export interface NativeFiyuMapProps {
  restaurants: MapRestaurant[];
  selectedPlaceId: string | null;
  onSelect(restaurant: MapRestaurant): void;
  onBackgroundPress(): void;
  userLocation?: { latitude: number; longitude: number } | null;
}

export function NativeFiyuMap({ restaurants, selectedPlaceId, onSelect, onBackgroundPress, userLocation }: NativeFiyuMapProps) {
  const [view, setViewState] = useState(IDENTITY_VIEW);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [spider, setSpider] = useState<string | null>(null);
  const viewRef = useRef(view);
  const gesture = useRef<{ view: MapView; midpoint?: Point; distance?: number; single?: Point }>({ view });
  const setView = (next: MapView) => { viewRef.current = next; setViewState(next); };
  const inputs = useMemo<ClusterInput<MapRestaurant>[]>(() => restaurants.map((item) => ({ id: item.place_id, point: project({ lat: item.latitude!, lng: item.longitude! }), item })), [restaurants]);
  const baseClusters = useMemo(() => clusterMarkers(inputs, view.k), [inputs, view.k]);
  const clusters = useMemo(() => {
    if (!spider) return baseClusters;
    const active = baseClusters.find((cluster) => cluster.id === spider);
    return active ? [...baseClusters.filter((cluster) => cluster.id !== spider), ...spiderfyMarkers(active.members, view.k)] : baseClusters;
  }, [baseClusters, spider, view.k]);
  const detail = view.k >= 2.5 ? 3 : view.k >= 1.5 ? 2 : 1;

  const beginGesture = (event: GestureResponderEvent) => {
    setSpider(null);
    const touches = event.nativeEvent.touches;
    const start: { view: MapView; midpoint?: Point; distance?: number; single?: Point } = { view: viewRef.current };
    if (touches.length >= 2) { const a = touchPoint(touches[0], size.width, size.height); const b = touchPoint(touches[1], size.width, size.height); start.midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; start.distance = Math.hypot(a.x - b.x, a.y - b.y); }
    else if (touches[0]) start.single = touchPoint(touches[0], size.width, size.height);
    gesture.current = start;
  };
  const moveGesture = (event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;
    if (touches.length >= 2 && gesture.current.midpoint && gesture.current.distance) { const a = touchPoint(touches[0], size.width, size.height); const b = touchPoint(touches[1], size.width, size.height); setView(pinchView(gesture.current.view, gesture.current.midpoint, gesture.current.distance, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, Math.hypot(a.x - b.x, a.y - b.y))); }
    else if (touches[0] && gesture.current.single) { const current = touchPoint(touches[0], size.width, size.height); setView(panBy(gesture.current.view, current.x - gesture.current.single.x, current.y - gesture.current.single.y)); }
  };

  const activateCluster = (cluster: MarkerCluster<MapRestaurant>) => {
    if (cluster.members.length === 1) { onSelect(cluster.members[0].item); return; }
    const coincident = cluster.members.every((member) => member.point.x === cluster.members[0].point.x && member.point.y === cluster.members[0].point.y);
    if (view.k >= MAX_SCALE || coincident) { setSpider(cluster.id); return; }
    setSpider(null); setView(zoomAt(viewRef.current, 1.75, cluster.point));
  };
  const onLayout = (event: LayoutChangeEvent) => setSize(event.nativeEvent.layout);
  return <View testID="native-fiyu-map" style={styles.root}>
    <View style={styles.mapSurface} onLayout={onLayout} onStartShouldSetResponder={() => false} onMoveShouldSetResponder={() => true} onResponderGrant={beginGesture} onResponderMove={moveGesture}>
    <Svg width="100%" height="100%" viewBox={viewBoxFor(view)} preserveAspectRatio="xMidYMid meet" onPress={onBackgroundPress}>
      <Basemap detail={detail} />
      {userLocation ? (() => { const point = project({ lat: userLocation.latitude, lng: userLocation.longitude }); return <G accessible accessibilityLabel="Your discovery location"><Circle cx={point.x} cy={point.y} r={9 / view.k} fill="#FFFFFF" stroke="#5A3F78" strokeWidth={2 / view.k} /><Circle cx={point.x} cy={point.y} r={3 / view.k} fill="#5A3F78" /></G>; })() : null}
      {LABELS.map(([label, lat, lng]) => { const point = project({ lat, lng }); return <SvgText key={label} x={point.x} y={point.y} fill="#706876" fontSize={12 / view.k} textAnchor="middle">{label}</SvgText>; })}
      {clusters.map((cluster) => {
        const selected = cluster.members.some((member) => member.id === selectedPlaceId);
        const color = strongestColor(cluster.members.map((member) => member.item));
        const radius = (cluster.members.length > 1 ? 17 : selected ? 12.5 : 11) / view.k;
        return <G key={cluster.id} accessible accessibilityRole="button" accessibilityLabel={cluster.members.length > 1 ? `${cluster.members.length} restaurants in this area` : cluster.members[0].item.name_ja ?? cluster.members[0].item.name_en ?? "Restaurant"} onPress={(event) => { event.stopPropagation(); activateCluster(cluster); }}>
          {selected ? <Circle cx={cluster.point.x} cy={cluster.point.y} r={19 / view.k} fill={color} opacity={0.25} /> : null}
          <Circle cx={cluster.point.x} cy={cluster.point.y} r={24 / view.k} fill="transparent" />
          <Circle cx={cluster.point.x} cy={cluster.point.y} r={radius} fill={color} stroke={OUTLINE} strokeWidth={(selected ? 2.5 : cluster.members.length > 1 ? 2 : 1.75) / view.k} />
          {cluster.members.length > 1 ? <SvgText x={cluster.point.x} y={cluster.point.y + 4 / view.k} fill="#FFF9EF" fontSize={13 / view.k} fontWeight="600" textAnchor="middle">{cluster.members.length}</SvgText> : null}
        </G>;
      })}
    </Svg></View>
    <View style={styles.zoomControls}>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" disabled={view.k >= MAX_SCALE} onPress={() => { setSpider(null); setView(zoomAt(viewRef.current, 1.5, { x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT / 2 })); }} style={styles.zoomButton}><Text style={styles.zoomText}>+</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" disabled={view.k <= 1} onPress={() => { setSpider(null); setView(zoomAt(viewRef.current, 1 / 1.5, { x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT / 2 })); }} style={styles.zoomButton}><Text style={styles.zoomText}>−</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Reset map" onPress={() => { setSpider(null); setView(IDENTITY_VIEW); }} style={styles.zoomButton}><Text style={styles.resetText}>⌂</Text></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1, overflow: "hidden", justifyContent: "center", backgroundColor: "#F7F2E9" }, mapSurface: { width: "100%", aspectRatio: VIEWBOX_WIDTH / VIEWBOX_HEIGHT }, zoomControls: { position: "absolute", top: 74, right: 12, overflow: "hidden", borderWidth: 1, borderColor: "#E6E1E9", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.94)" }, zoomButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E6E1E9" }, zoomText: { color: "#443A78", fontSize: 23, lineHeight: 25 }, resetText: { color: "#443A78", fontSize: 17 } });

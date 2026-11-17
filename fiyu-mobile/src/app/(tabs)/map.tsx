import type { MapRestaurant } from "@fiyu/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchMyPicks } from "@/api/client";
import { picksKeys, useMapRestaurants, useMapSupplementalResources } from "@/api/queries";
import { NativeFiyuMap } from "@/components/map/NativeFiyuMap";
import { AppHeader } from "@/components/navigation/AppHeader";
import { colors, fontFamilies, radii, spacing } from "@/design";
import { mapGeography } from "@/lib/map/geography";
import { belongsToFilter, expireDiscoveries, MARKER_COLORS, markerState, mayOpenPublicDetail, mergePersonalized, PERSONAL_MAP_FILTERS, type PersonalMapFilter } from "@/lib/map/personalMap";
import { formatFiyuScore, restaurantArea, restaurantName, restaurantSecondaryName } from "@/lib/presentation";

const EMPTY: Record<PersonalMapFilter, string> = { all: "No places yet", saved: "No saved places yet", visited: "No visited places yet", discovered: "No recent discoveries" };
const LEGEND = [["Personalized", "personalized"], ["My Pick", "my_pick"], ["Recent", "recent"], ["Visited", "visited"], ["Saved", "saved"]] as const;

function activePersonalized(state: ReturnType<typeof useMapSupplementalResources>["personalized"]["data"]): MapRestaurant | null {
  if (state?.status !== "selected" || !state.selected_restaurant) return null;
  return { ...state.selected_restaurant, is_discovered: true, discovery_expires_at: state.active_until, is_saved: false, is_visited: false, user_rating: null, is_personalized_pick: true };
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const map = useMapRestaurants();
  const supplements = useMapSupplementalResources();
  const myPicks = useQuery({ queryKey: picksKeys.myPicks, queryFn: fetchMyPicks });
  const [filter, setFilter] = useState<PersonalMapFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const refetchMap = map.refetch;
  const refetchPersonalized = supplements.personalized.refetch;
  const refetchMyPicks = myPicks.refetch;
  useFocusEffect(useCallback(() => {
    void refetchMap();
    void refetchPersonalized();
    void refetchMyPicks();
  }, [refetchMap, refetchMyPicks, refetchPersonalized]));
  const readyMyPickIds = myPicks.data?.filter((item) => item.result_ready && item.map_ready && item.place_id).map((item) => item.place_id).sort().join("|") ?? "";
  useEffect(() => { if (readyMyPickIds) void queryClient.invalidateQueries({ queryKey: picksKeys.map }); }, [queryClient, readyMyPickIds]);
  const all = useMemo(() => expireDiscoveries(mergePersonalized(map.data ?? [], activePersonalized(supplements.personalized.data)), now), [map.data, now, supplements.personalized.data]);
  const visible = useMemo(() => all.filter((row) => belongsToFilter(row, filter)), [all, filter]);
  const selected = visible.find((row) => row.place_id === selectedId) ?? null;
  const privatePick = selected ? !mayOpenPublicDetail(selected, myPicks.data) : false;

  const changeFilter = (value: PersonalMapFilter) => { setFilter(value); if (selectedId && !all.some((row) => row.place_id === selectedId && belongsToFilter(row, value))) setSelectedId(null); };
  return <SafeAreaView edges={["top"]} style={styles.screen}>
    <AppHeader onOpenMenu={() => router.push("/profile")} />
    <View testID="map-frame" style={styles.mapFrame}>
    {map.data ? <NativeFiyuMap restaurants={visible} selectedPlaceId={selectedId} onSelect={(row) => setSelectedId(row.place_id)} onBackgroundPress={() => setSelectedId(null)} userLocation={supplements.location.data?.configured && supplements.location.data.discovery_latitude !== null && supplements.location.data.discovery_longitude !== null ? { latitude: supplements.location.data.discovery_latitude, longitude: supplements.location.data.discovery_longitude } : null} /> : map.isError ? <View style={styles.center}><Text style={styles.error}>We couldn&apos;t load your map.</Text><Pressable onPress={() => map.refetch()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View> : <View style={styles.center}><ActivityIndicator color={colors.lavender[600]} /><Text style={styles.loading}>Loading your map…</Text></View>}
    <View testID="map-filter-card" style={styles.filterCard}>
      <Text style={styles.filterHeading}>Your map</Text>
      <View style={styles.filters} accessibilityRole="tablist">
        {PERSONAL_MAP_FILTERS.map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: filter === item }} onPress={() => changeFilter(item)} style={[styles.filter, filter === item && styles.filterActive]}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item === "all" ? "All" : item[0].toUpperCase() + item.slice(1)}</Text></Pressable>)}
      </View>
    </View>
    {map.data && visible.length === 0 ? <View pointerEvents="none" style={styles.empty}><Text style={styles.emptyText}>{EMPTY[filter]}</Text></View> : null}
    <View testID="map-legend" style={[styles.legendWrap, { bottom: selected ? 184 : spacing[3] }]}>
      {legendOpen ? <View style={styles.legend}>{LEGEND.map(([label, state]) => <View key={state} style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: MARKER_COLORS[state] }]} /><Text style={styles.legendText}>{label}</Text></View>)}<Text style={styles.legendNote}>Illustrated map. Not for navigation.</Text></View> : null}
      <View style={styles.legendActions}><Pressable accessibilityRole="button" onPress={() => setLegendOpen((open) => !open)} style={styles.keyButton}><Text style={styles.keyText}>{legendOpen ? "Hide key" : "Map key"}</Text></Pressable><Pressable accessibilityRole="link" onPress={() => void Linking.openURL(mapGeography.source)}><Text style={styles.credit}>{mapGeography.attribution}</Text></Pressable></View>
    </View>
    {selected ? <View style={[styles.detail, { paddingBottom: Math.max(spacing[4], insets.bottom) }]} testID="map-detail-card">
      <View style={[styles.detailRule, { backgroundColor: MARKER_COLORS[markerState(selected)] }]} /><Text style={styles.detailEyebrow}>{markerState(selected).replace("_", " ").toUpperCase()}</Text><Text numberOfLines={1} style={styles.detailName}>{restaurantName(selected)}</Text>{restaurantSecondaryName(selected) ? <Text numberOfLines={1} style={styles.secondaryName}>{restaurantSecondaryName(selected)}</Text> : null}<Text numberOfLines={1} style={styles.detailMeta}>{[selected.category, restaurantArea(selected), selected.location_label].filter(Boolean).join(" · ")}</Text>{selected.fiyu_score !== null ? <View style={styles.scoreLine}><Text style={styles.scoreLabel}>FIYU SCORE</Text><Text style={styles.scoreValue}>{formatFiyuScore(selected.fiyu_score)}</Text></View> : null}
      {privatePick ? <Text style={styles.privateNote}>Private My Pick · visible only to you</Text> : <Pressable accessibilityRole="button" onPress={() => router.push(`/restaurants/${encodeURIComponent(selected.place_id)}`)} style={styles.open}><Text style={styles.openText}>View restaurant →</Text></Pressable>}
    </View> : null}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas }, mapFrame: { flex: 1, overflow: "hidden", backgroundColor: "#F4EFE7" }, center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing[3] }, loading: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 14 }, error: { color: colors.inkBody, fontFamily: fontFamilies.body, fontSize: 14 }, retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing[4], borderRadius: radii.pill, backgroundColor: colors.lavender[100] }, retryText: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold },
  filterCard: { position: "absolute", top: spacing[3], left: spacing[3], right: 76, paddingHorizontal: spacing[3], paddingVertical: 10, borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: "rgba(255,255,255,0.95)", shadowColor: colors.ink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 }, filterHeading: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 20, lineHeight: 22 },
  filters: { flexDirection: "row", marginTop: 10, padding: 2, borderWidth: 1, borderColor: "rgba(230,225,233,0.8)", borderRadius: radii.pill, backgroundColor: "rgba(243,240,248,0.8)" }, filter: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radii.pill, paddingHorizontal: 2 }, filterActive: { backgroundColor: colors.surface, shadowColor: colors.ink, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 }, filterText: { color: colors.inkMuted, fontFamily: fontFamilies.bodySemiBold, fontSize: 10, letterSpacing: 0.25 }, filterTextActive: { color: colors.lavender[700] },
  empty: { position: "absolute", top: 112, alignSelf: "center", borderWidth: 1, borderColor: colors.line, borderRadius: radii.pill, backgroundColor: "rgba(255,255,255,0.94)", paddingHorizontal: spacing[3], paddingVertical: spacing[2] }, emptyText: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 12 },
  legendWrap: { position: "absolute", left: spacing[3], gap: spacing[1] }, legend: { alignSelf: "flex-start", gap: 6, padding: spacing[3], borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: "rgba(255,255,255,0.96)" }, legendRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] }, legendDot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1.5, borderColor: "#403B46" }, legendText: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 11 }, legendNote: { maxWidth: 180, marginTop: 3, color: colors.inkFaint, fontFamily: fontFamilies.body, fontSize: 9 }, legendActions: { flexDirection: "row", alignItems: "center", gap: spacing[2] }, keyButton: { paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderWidth: 1, borderColor: colors.line, borderRadius: radii.pill, backgroundColor: "rgba(255,255,255,0.94)" }, keyText: { color: colors.inkMuted, fontFamily: fontFamilies.bodyMedium, fontSize: 10 }, credit: { color: colors.inkFaint, fontFamily: fontFamilies.body, fontSize: 8, textDecorationLine: "underline" },
  detail: { position: "absolute", left: spacing[3], right: spacing[3], bottom: spacing[3], overflow: "hidden", padding: spacing[4], borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface, shadowColor: colors.ink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 5 }, detailRule: { position: "absolute", top: 0, left: 0, right: 0, height: 3 }, detailEyebrow: { marginTop: 2, color: colors.inkFaint, fontFamily: fontFamilies.bodySemiBold, fontSize: 9, letterSpacing: 1.4 }, detailName: { marginTop: spacing[1], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 24 }, secondaryName: { marginTop: 2, color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 12 }, detailMeta: { marginTop: spacing[1], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 11 }, scoreLine: { marginTop: spacing[2], paddingTop: spacing[2], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }, scoreLabel: { color: colors.inkFaint, fontFamily: fontFamilies.bodySemiBold, fontSize: 9, letterSpacing: 1.1 }, scoreValue: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 18 }, privateNote: { marginTop: spacing[3], color: colors.myPick.text, fontFamily: fontFamilies.bodyMedium, fontSize: 12 }, open: { minHeight: 44, justifyContent: "center", marginTop: spacing[2] }, openText: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 13 },
});

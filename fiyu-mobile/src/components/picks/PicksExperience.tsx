import type { DailyPickAssignmentResponse, PublicRestaurant } from "@fiyu/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import {
  assignDailyPicks,
  createPersonalizedPickEvent,
  dismissPersonalizedPickEvent,
  revealDailyPick,
  selectPersonalizedPick,
} from "@/api/client";
import { PICKS_CITY_ID, picksKeys, usePicksResources } from "@/api/queries";
import { useRestaurantRelationships } from "@/components/restaurant/useRestaurantRelationships";
import { MyPickSection } from "@/components/my-pick/MyPickSection";
import { TogetherEntry } from "@/components/together/TogetherEntry";
import { colors, fontFamilies, radii, spacing } from "@/design";
import { recentDiscoveries } from "@/lib/picks";
import { restaurantName } from "@/lib/presentation";
import { ConcealedPickCard, RevealedPickCard } from "./PickCard";
import { PicksHeader } from "./PicksHeader";
import { PersonalizedPickModal } from "./PersonalizedPickModal";
import { RevealCard } from "./RevealCard";
import { VisitModal } from "./VisitModal";

type ListItem =
  | { key: string; kind: "daily"; restaurant: PublicRestaurant; index: number; revealed: boolean }
  | { key: string; kind: "my-pick" }
  | { key: string; kind: "together" }
  | { key: string; kind: "recent-section" };

interface PicksExperienceProps { onOpenRestaurant(placeId: string): void; onOpenTogether(): void; onOpenTogetherSession(sessionId: string): void; onOpenMenu(): void; initialMyPickId?: string }

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function PicksExperience({ onOpenRestaurant, onOpenTogether, onOpenTogetherSession, onOpenMenu, initialMyPickId }: PicksExperienceProps) {
  const resources = usePicksResources();
  const relationships = useRestaurantRelationships();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [visitTarget, setVisitTarget] = useState<PublicRestaurant | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [finding, setFinding] = useState(false);
  const findingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventAttempted = useRef(false);

  const active = resources.active.data;
  const savedIds = relationships.savedIds;
  const visitsByPlace = relationships.visitsByPlace;
  const activeIds = useMemo(() => new Set(active?.place_ids ?? []), [active?.place_ids]);
  const recent = useMemo(() => recentDiscoveries(resources.recent.data ?? [], now, activeIds), [activeIds, now, resources.recent.data]);

  const assign = useMutation({
    mutationFn: () => assignDailyPicks({
      city_id: PICKS_CITY_ID,
      legacy_served_place_ids: [],
      categories: [],
      non_japanese: "occasionally",
      active_area: resources.location.data?.discovery_label ?? null,
      location_mode: resources.location.data?.location_mode ?? null,
      location_state: resources.location.data?.location_mode === "current"
        ? "in_tokyo_live_gps"
        : resources.location.data?.location_mode === "preview" || resources.location.data?.location_mode === "manual"
          ? "outside_tokyo_with_preview_area"
          : "location_unavailable",
      discovery_latitude: resources.location.data?.discovery_latitude ?? null,
      discovery_longitude: resources.location.data?.discovery_longitude ?? null,
      requested_count: 3,
    }),
    onSuccess: (assignment) => { setActionError(null); queryClient.setQueryData(picksKeys.active, assignment); },
    onError: (error) => setActionError(message(error, "Fiyu could not find today’s Picks.")),
  });
  const reveal = useMutation({
    mutationFn: ({ roundId, placeId }: { roundId: string; placeId: string }) => revealDailyPick(roundId, placeId),
    onSuccess: (result) => {
      setActionError(null);
      queryClient.setQueryData<DailyPickAssignmentResponse | null>(picksKeys.active, (prior) => prior ? { ...prior, revealed_at: result.revealed_at, revealed_place_ids: result.revealed_place_ids, revealed_at_by_place_id: { ...prior.revealed_at_by_place_id, [result.place_id]: result.pick_revealed_at } } : prior);
      void queryClient.invalidateQueries({ queryKey: picksKeys.recent });
    },
    onError: (error) => setActionError(message(error, "This Pick could not be revealed. Try again.")),
  });
  const personalizedCreate = useMutation({
    mutationFn: createPersonalizedPickEvent,
    onSuccess: (state) => queryClient.setQueryData(picksKeys.personalized, state),
  });
  const personalizedSelect = useMutation({
    mutationFn: ({ eventId, position }: { eventId: string; position: number }) => selectPersonalizedPick(eventId, position),
    onSuccess: (state) => { setActionError(null); queryClient.setQueryData(picksKeys.personalized, state); },
    onError: (error) => setActionError(message(error, "Your Personalized Pick could not be selected.")),
  });
  const personalizedDismiss = useMutation({
    mutationFn: dismissPersonalizedPickEvent,
    onSuccess: (state) => queryClient.setQueryData(picksKeys.personalized, state),
  });

  useEffect(() => {
    const state = resources.personalized.data;
    if (state?.status === "unlocked_idle" && state.event_eligible && !eventAttempted.current) {
      eventAttempted.current = true;
      personalizedCreate.mutate();
    }
  }, [personalizedCreate, resources.personalized.data]);

  useEffect(() => () => {
    if (findingTimer.current) clearTimeout(findingTimer.current);
  }, []);

  const items = useMemo<ListItem[]>(() => {
    const next: ListItem[] = [];
    for (const [index, restaurant] of (active?.restaurants ?? []).entries()) {
      next.push({ key: `daily-${restaurant.place_id}`, kind: "daily", restaurant, index, revealed: active?.revealed_place_ids.includes(restaurant.place_id) === true || visitsByPlace.has(restaurant.place_id) });
    }
    next.push({ key: "my-pick", kind: "my-pick" });
    next.push({ key: "recent-section", kind: "recent-section" });
    if (resources.together.data) next.push({ key: "together", kind: "together" });
    return next;
  }, [active, resources.together.data, visitsByPlace]);

  const refresh = () => {
    setNow(Date.now());
    return Promise.all([resources.active.refetch(), resources.recent.refetch(), relationships.refetch(), resources.personalized.refetch(), resources.together.refetch()]);
  };
  const loading = resources.active.isLoading || relationships.loading;
  const primaryError = !active && resources.active.error;
  const personalizedVisible = resources.personalized.data?.status === "event_available"
    && (!resources.personalized.data.dismissed_until || Date.parse(resources.personalized.data.dismissed_until) <= now);
  const unrevealed = active?.place_ids.filter((placeId) => !active.revealed_place_ids.includes(placeId) && !visitsByPlace.has(placeId)) ?? [];
  const revealAll = async () => {
    if (!active || reveal.isPending) return;
    for (const placeId of unrevealed) {
      try {
        await reveal.mutateAsync({ roundId: active.round_id, placeId });
      } catch {
        break;
      }
    }
  };

  const renderRestaurant = (item: ListItem) => {
    if (item.kind === "my-pick") return <MyPickSection initialMyPickId={initialMyPickId} onOpenRestaurant={onOpenRestaurant} />;
    if (item.kind === "together") return <TogetherEntry state={resources.together.data!} onOpenHub={onOpenTogether} onOpenSession={onOpenTogetherSession} />;
    if (item.kind === "recent-section") return <RecentDiscoveriesSection
      personalized={resources.personalized.data?.status === "selected" ? resources.personalized.data.selected_restaurant : null}
      recent={recent}
      savedIds={savedIds}
      visitsByPlace={visitsByPlace}
      relationships={relationships}
      onOpenRestaurant={onOpenRestaurant}
      onVisit={setVisitTarget}
    />;
    const restaurant = item.restaurant;
    const saved = savedIds.has(restaurant.place_id);
    const visited = visitsByPlace.has(restaurant.place_id);
    const card = <RevealedPickCard restaurant={restaurant} saved={saved} visited={visited} savePending={relationships.savePendingPlaceId === restaurant.place_id} visitPending={relationships.visitPendingPlaceId === restaurant.place_id} onOpen={() => onOpenRestaurant(restaurant.place_id)} onSave={() => relationships.toggleSaved(restaurant.place_id)} onLog={() => setVisitTarget(restaurant)} />;
    return <View style={styles.item}><RevealCard revealed={item.revealed} busy={reveal.isPending} label={`Reveal Fiyu Pick ${item.index + 1}`} onReveal={() => active ? reveal.mutateAsync({ roundId: active.round_id, placeId: restaurant.place_id }) : Promise.resolve()} concealed={<ConcealedPickCard index={item.index} />}>{card}</RevealCard></View>;
  };

  const beginAssignment = async () => {
    if (assign.isPending || finding) return;
    const startedAt = Date.now();
    setFinding(true);
    try {
      await assign.mutateAsync();
    } finally {
      const remaining = Math.max(0, 1200 - (Date.now() - startedAt));
      findingTimer.current = setTimeout(() => setFinding(false), remaining);
    }
  };

  const searchLabel = resources.location.data?.discovery_label
    ? `Searching near ${resources.location.data.discovery_label}`
    : "Searching nearby";

  return (
    <View style={styles.screen}>
      <PicksHeader onOpenMenu={onOpenMenu} />
      <FlatList
        data={(loading && !active) || finding ? [] : items}
        keyExtractor={(item) => item.key}
        initialNumToRender={4}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item }) => renderRestaurant(item)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={resources.active.isRefetching} onRefresh={() => void refresh()} tintColor={colors.lavender[600]} />}
        ListHeaderComponent={<View><View style={styles.eyebrowRow}><View style={styles.eyebrowLine} /><Text style={styles.eyebrow}>TODAY</Text></View><View style={styles.headingRow}><Text style={styles.heading}>Today’s Fiyu Picks</Text><Text style={styles.frequency}>3 PICKS{"\n"}<Text style={styles.frequencyDaily}>Daily</Text></Text></View><View style={styles.headingRule}><View style={styles.headingAccent} /></View><View style={styles.headerMeta}>{resources.location.data?.discovery_label ? <Text numberOfLines={1} style={styles.location}>{resources.location.data.discovery_label}</Text> : <Text style={styles.location}>Near you</Text>}{active ? <Pressable accessibilityRole="button" disabled={reveal.isPending || unrevealed.length === 0} onPress={() => void revealAll()} style={styles.revealAll}><Text style={styles.revealAllText}>{unrevealed.length === 0 ? "All Picks revealed" : reveal.isPending ? "Revealing…" : "Reveal all →"}</Text></Pressable> : null}</View>{(loading && !active) || finding ? <FindingState label={searchLabel} /> : null}{primaryError && !finding ? <View style={styles.status}><Text style={styles.error}>Your Picks could not connect.</Text><Pressable onPress={() => void resources.active.refetch()} style={styles.retryButton}><Text style={styles.retryButtonText}>Try again</Text></Pressable></View> : null}{!loading && !finding && !primaryError && !active ? <View style={styles.ctaWrap}><Pressable accessibilityRole="button" disabled={assign.isPending} onPress={() => void beginAssignment()} style={styles.button}><Text style={styles.buttonText}>Find today’s restaurants</Text></Pressable></View> : null}{actionError || relationships.saveError || relationships.visitError ? <Text accessibilityRole="alert" style={styles.error}>{actionError ?? relationships.saveError ?? relationships.visitError}</Text> : null}</View>}
        ListFooterComponent={<View style={styles.bottomSpace} />}
      />
      <PersonalizedPickModal visible={personalizedVisible} pending={personalizedSelect.isPending || personalizedDismiss.isPending} error={personalizedSelect.error ? message(personalizedSelect.error, "Try again.") : null} onChoose={(position) => { const id = resources.personalized.data?.event_id; if (id && !personalizedSelect.isPending) personalizedSelect.mutate({ eventId: id, position }); }} onDismiss={() => { const id = resources.personalized.data?.event_id; if (id && !personalizedDismiss.isPending) personalizedDismiss.mutate(id); }} />
      <VisitModal name={visitTarget ? restaurantName(visitTarget) : null} pending={relationships.visitPendingPlaceId !== null} error={relationships.visitError} onClose={() => !relationships.visitPendingPlaceId && setVisitTarget(null)} onSubmit={(rating, note) => visitTarget && relationships.logVisit(visitTarget.place_id, rating, note, () => setVisitTarget(null))} />
    </View>
  );
}

function FindingState({ label }: { label: string }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 1000, useNativeDriver: true, isInteraction: false }));
    animation.start();
    return () => animation.stop();
  }, [progress]);
  return <View accessibilityLabel={`${label}. Finding a few places worth knowing.`} accessibilityRole="progressbar" style={styles.finding}>
    <Text style={styles.findingWordmark}>Fiyu</Text>
    <Text style={styles.findingLabel}>{label}</Text>
    <Text style={styles.statusText}>Finding a few places worth knowing.</Text>
    <View style={styles.dots}>{[0, 1, 2].map((index) => <Animated.View key={index} style={[styles.dot, { opacity: progress.interpolate({ inputRange: [0, index * 0.2, index * 0.2 + 0.25, 1], outputRange: [0.3, 0.3, 1, 0.3] }), transform: [{ translateY: progress.interpolate({ inputRange: [0, index * 0.2, index * 0.2 + 0.25, 1], outputRange: [0, 0, -4, 0] }) }] }]} />)}</View>
  </View>;
}

type Relationships = ReturnType<typeof useRestaurantRelationships>;
function RecentDiscoveriesSection({ personalized, recent, savedIds, visitsByPlace, relationships, onOpenRestaurant, onVisit }: {
  personalized: PublicRestaurant | null | undefined;
  recent: ReturnType<typeof recentDiscoveries>;
  savedIds: Set<string>;
  visitsByPlace: Map<string, unknown>;
  relationships: Relationships;
  onOpenRestaurant(placeId: string): void;
  onVisit(restaurant: PublicRestaurant): void;
}) {
  const discoveries = recent.filter((entry) => entry.restaurant.place_id !== personalized?.place_id);
  const rows = personalized ? [{ restaurant: personalized, personalized: true, expiresAt: null }, ...discoveries.map((entry) => ({ ...entry, personalized: false }))] : discoveries.map((entry) => ({ ...entry, personalized: false }));
  return <View style={styles.recentSection}>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Recent Discoveries</Text></View>
    {rows.length === 0 ? <RecentDiscoveriesEmptyState /> : rows.map(({ restaurant, personalized: isPersonalized }) => <View key={restaurant.place_id} style={styles.item}>
      <RevealedPickCard restaurant={restaurant} saved={savedIds.has(restaurant.place_id)} visited={visitsByPlace.has(restaurant.place_id)} savePending={relationships.savePendingPlaceId === restaurant.place_id} visitPending={relationships.visitPendingPlaceId === restaurant.place_id} tone={isPersonalized ? "personalized" : "recent"} onOpen={() => onOpenRestaurant(restaurant.place_id)} onSave={() => relationships.toggleSaved(restaurant.place_id)} onLog={() => onVisit(restaurant)} />
      <Text style={styles.expiry}>Available in Recent Discoveries for 72 hours</Text>
    </View>)}
  </View>;
}

type DecorativeSvgAccessibilityProps = {
  "aria-hidden"?: true;
  accessibilityElementsHidden?: true;
  focusable: false;
  importantForAccessibility?: "no-hide-descendants";
};

export function decorativeSvgAccessibilityProps(platform: string): DecorativeSvgAccessibilityProps {
  return platform === "web"
    ? { "aria-hidden": true, focusable: false }
    : { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants", focusable: false };
}

export function RecentDiscoveriesEmptyState() {
  return <View style={styles.emptyDiscoveries}>
    <Svg testID="recent-discoveries-icon" {...decorativeSvgAccessibilityProps(Platform.OS)} width={64} height={34} viewBox="0 0 64 34">
      <Path d="M3 29.5h58M8 29V17h9v12M19 29V13h10v16M31 29V8h11v21M44 29V16h9v13M25 13V8h4v5M34 8V4h5v4" fill="none" stroke="#4D435A" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x={12} y={20} width={2} height={2} fill="#9589DF" />
      <Rect x={35} y={12} width={2} height={2} fill="#9589DF" />
      <Rect x={47} y={20} width={2} height={2} fill="#9589DF" />
    </Svg>
    <Text style={styles.emptyTitle}>No recent discoveries</Text>
    <Text style={styles.emptyCopy}>Revealed restaurants remain here for 72 hours.</Text>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  list: { paddingHorizontal: spacing[5], paddingTop: spacing[4], backgroundColor: colors.canvas },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  eyebrowLine: { width: 20, height: 2, backgroundColor: colors.lavender[500] },
  eyebrow: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 10, letterSpacing: 1.8 },
  headingRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing[3], marginTop: spacing[1] },
  heading: { flex: 1, color: colors.ink, fontFamily: fontFamilies.display, fontSize: 34, lineHeight: 38 },
  frequency: { color: colors.inkMuted, fontFamily: fontFamilies.bodySemiBold, fontSize: 9, lineHeight: 16, letterSpacing: 1, textAlign: "right" },
  frequencyDaily: { color: colors.inkBody, fontSize: 12, letterSpacing: 0 },
  headingRule: { height: 1, marginTop: spacing[2], backgroundColor: colors.line },
  headingAccent: { width: 40, height: 2, backgroundColor: colors.lavender[500] },
  location: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 13 },
  headerMeta: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing[3] },
  revealAll: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing[2] },
  revealAllText: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 12 },
  item: { marginTop: spacing[4] },
  status: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: spacing[3] },
  statusText: { color: colors.inkMuted, fontFamily: fontFamilies.body },
  ctaWrap: { paddingTop: spacing[4], paddingBottom: spacing[2] },
  button: { width: "100%", minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radii.control, backgroundColor: colors.lavender[600], paddingHorizontal: spacing[4] },
  buttonText: { color: colors.surface, fontFamily: fontFamilies.bodySemiBold, fontSize: 14 },
  retryButton: { minHeight: 44, justifyContent: "center", marginTop: spacing[3], borderRadius: radii.control, backgroundColor: colors.plum, paddingHorizontal: spacing[4] },
  retryButtonText: { color: colors.surface, fontFamily: fontFamilies.bodySemiBold, fontSize: 14 },
  error: { marginTop: spacing[3], color: colors.roseDust, fontFamily: fontFamilies.bodyMedium, fontSize: 13 },
  expiry: { marginTop: spacing[2], color: "#5D6F95", fontFamily: fontFamilies.bodyMedium, fontSize: 11 },
  sectionHeading: { paddingBottom: spacing[2] },
  sectionTitle: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 22, lineHeight: 28 },
  recentSection: { marginTop: spacing[5], borderTopWidth: 2, borderTopColor: colors.lavender[100], paddingTop: spacing[5] },
  emptyDiscoveries: { alignItems: "center", paddingTop: spacing[8], paddingBottom: spacing[6] },
  emptyTitle: { marginTop: spacing[3], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 17, lineHeight: 22 },
  emptyCopy: { marginTop: spacing[2], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 13, textAlign: "center" },
  finding: { minHeight: 220, alignItems: "center", justifyContent: "center" },
  findingWordmark: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 31 },
  findingLabel: { marginTop: spacing[3], color: colors.ink, fontFamily: fontFamilies.bodySemiBold, fontSize: 14 },
  dots: { flexDirection: "row", gap: spacing[2], marginTop: spacing[4] },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.plum },
  bottomSpace: { height: spacing[6] },
});

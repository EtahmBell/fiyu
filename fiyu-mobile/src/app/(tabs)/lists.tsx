import type { DefaultListResponse, MyPick, SavedRestaurantSummary } from "@fiyu/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { removeFromDefaultList } from "@/api/client";
import { PICKS_CITY_ID, picksKeys, useListsResources } from "@/api/queries";
import { AccountRestaurantRow } from "@/components/account/AccountRestaurantRow";
import { AppHeader } from "@/components/navigation/AppHeader";
import { colors, fontFamilies, radii, spacing } from "@/design";
import { SMART_VIEW_LABELS, sortSmartViews } from "@/lib/account/presentation";
import { completedMyPicks } from "@/lib/myPickLifecycle";

type ListTab = "saved" | "mine" | "smart";

const HEADERS: Record<ListTab, { eyebrow: string; title: string; description: string }> = {
  saved: { eyebrow: "TOKYO EDITION", title: "Your Tokyo list", description: "Restaurants you save in Tokyo appear here." },
  mine: { eyebrow: "YOUR FIYU", title: "Mine", description: "Restaurants you brought to Fiyu, kept here after their result is ready." },
  smart: { eyebrow: "TOKYO EDITION", title: "Smart views", description: "Your saved places, reorganized for different ways of exploring Tokyo." },
};

function mineRestaurant(item: MyPick): SavedRestaurantSummary {
  return { place_id: item.place_id ?? item.my_pick_id, name_ja: item.name_ja, name_en: item.name_en, primary_category: item.primary_category, neighborhood: item.display_area, display_area: item.display_area, fiyu_score: item.fiyu_score, score_band: null };
}

function PageHeader({ tab }: { tab: ListTab }) {
  const heading = HEADERS[tab];
  return <View style={styles.pageHeader}>
    <View style={styles.eyebrowRow}><View style={styles.eyebrowLine} /><Text style={styles.eyebrow}>{heading.eyebrow}</Text></View>
    <Text style={styles.heading}>{heading.title}</Text>
    <Text style={styles.intro}>{heading.description}</Text>
  </View>;
}

function ListTabs({ tab, onChange }: { tab: ListTab; onChange(tab: ListTab): void }) {
  return <View accessibilityRole="tablist" style={styles.tabs}>{(["saved", "mine", "smart"] as const).map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => onChange(value)} style={[styles.tab, tab === value && styles.tabActive]}><Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{value === "saved" ? "Saved" : value === "mine" ? "Mine" : "Smart"}</Text></Pressable>)}</View>;
}

function CollectionStrip({ count }: { count: number }) {
  return <View style={styles.collectionStrip}>
    <Text style={styles.collectionTitle}>Your Tokyo collection</Text>
    <Text style={styles.count}>{count} saved {count === 1 ? "place" : "places"}</Text>
  </View>;
}

export default function ListsScreen({ photoEnabled = true, initialTab = "saved" }: { photoEnabled?: boolean; initialTab?: ListTab } = {}) {
  const [tab, setTab] = useState<ListTab>(initialTab);
  const queryClient = useQueryClient();
  const { saved, mine, smart } = useListsResources();
  const items = useMemo(() => [...(saved.data?.items ?? [])].sort((a, b) => b.added_at.localeCompare(a.added_at)), [saved.data]);
  const mineItems = useMemo(() => completedMyPicks(mine.data ?? []), [mine.data]);
  const remove = useMutation({ mutationFn: (placeId: string) => removeFromDefaultList(PICKS_CITY_ID, placeId), onSuccess(response) { queryClient.setQueryData<DefaultListResponse>(picksKeys.saved, response.list); void queryClient.invalidateQueries({ queryKey: picksKeys.smartViews }); void queryClient.invalidateQueries({ queryKey: picksKeys.map }); } });
  const active = tab === "saved" ? saved : tab === "mine" ? mine : smart;
  const refresh = () => void active.refetch();

  return <SafeAreaView edges={["top"]} style={styles.safe}>
    <AppHeader onOpenMenu={() => router.push("/profile")} />
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={active.isRefetching} onRefresh={refresh} tintColor={colors.lavender[600]} />}>
      <PageHeader tab={tab} />
      <ListTabs onChange={setTab} tab={tab} />
      {active.isLoading ? <Text style={styles.status}>Loading your lists…</Text> : active.isError && !active.data ? <ErrorState text="We couldn’t load your lists." onRetry={refresh} /> : tab === "saved" ? items.length ? <View style={styles.savedPanel}>
        <CollectionStrip count={items.length} />
        <View style={styles.stack}>{items.map((item) => <AccountRestaurantRow key={item.place_id} restaurant={item.restaurant} photoEnabled={photoEnabled} onOpen={() => router.push({ pathname: "/restaurants/[placeId]", params: { placeId: item.place_id } })} onRemove={() => remove.mutate(item.place_id)} removePending={remove.isPending && remove.variables === item.place_id} />)}</View>
        {remove.error ? <Text accessibilityRole="alert" style={styles.error}>Saved places could not be updated.</Text> : null}
      </View> : <EmptyState /> : tab === "mine" ? mineItems.length ? <View style={styles.savedPanel}>
        <View style={styles.collectionStrip}><Text style={styles.collectionTitle}>Your Fiyu collection</Text><Text style={styles.count}>{mineItems.length} {mineItems.length === 1 ? "restaurant" : "restaurants"}</Text></View>
        <View style={styles.stack}>{mineItems.map((item) => <AccountRestaurantRow key={item.my_pick_id} restaurant={mineRestaurant(item)} detail={item.is_public ? "My Pick" : "Private My Pick · visible only to you"} photoEnabled={photoEnabled && item.is_public && Boolean(item.place_id)} onOpen={item.is_public && item.place_id ? () => router.push({ pathname: "/restaurants/[placeId]", params: { placeId: item.place_id! } }) : undefined} />)}</View>
      </View> : <MineEmptyState /> : <View style={styles.smartStack}>{sortSmartViews(smart.data?.views ?? []).map((view) => <Pressable key={view.key} accessibilityRole="button" accessibilityLabel={`Open ${SMART_VIEW_LABELS[view.key] ?? view.label}`} disabled={view.locked} onPress={() => router.push({ pathname: "/lists/smart/[viewKey]" as never, params: { viewKey: view.key } })} style={[styles.smartCard, view.locked && styles.locked]}><Text style={styles.smartEyebrow}>{view.locked ? "FIYU PREMIUM" : "SMART VIEW"}</Text><Text style={styles.smartTitle}>{SMART_VIEW_LABELS[view.key] ?? view.label}</Text><Text style={styles.smartDescription}>{view.description}</Text><Text style={styles.smartCount}>{view.locked ? "Premium collection" : view.item_count == null ? "Open →" : `${view.item_count} ${view.item_count === 1 ? "place" : "places"} →`}</Text></Pressable>)}{smart.isError ? <Text accessibilityRole="alert" style={styles.error}>Smart Lists could not refresh.</Text> : null}</View>}
    </ScrollView>
  </SafeAreaView>;
}

function ErrorState({ text, onRetry }: { text: string; onRetry(): void }) { return <View style={styles.notice}><Text style={styles.noticeTitle}>{text}</Text><Text style={styles.noticeCopy}>Try again in a moment.</Text><Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable></View>; }
function EmptyState() { return <View style={styles.empty}><View accessibilityElementsHidden style={styles.emptyPreview}><View style={styles.emptyPhoto} /><View style={styles.emptyLines}><View style={styles.emptyLineLong} /><View style={styles.emptyLineShort} /></View></View><Text style={styles.noticeTitle}>No saved places yet</Text><Text style={styles.noticeCopy}>Save a restaurant from your daily Picks and it will appear here.</Text><Pressable onPress={() => router.navigate("/(tabs)/picks")}><Text style={styles.link}>Explore today’s Picks →</Text></Pressable></View>; }
function MineEmptyState() { return <View style={styles.empty}><Text style={styles.noticeTitle}>No My Picks yet</Text><Text style={styles.noticeCopy}>Restaurants you bring to Fiyu will stay here after their result is ready.</Text><Pressable onPress={() => router.navigate("/(tabs)/picks")}><Text style={styles.link}>Try My Pick →</Text></Pressable></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing[5], paddingTop: spacing[8], paddingBottom: spacing[12] },
  pageHeader: { gap: 0 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  eyebrowLine: { width: 24, height: 2, borderRadius: 2, backgroundColor: colors.lavender[600] },
  eyebrow: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 10, letterSpacing: 1.5 },
  heading: { marginTop: spacing[3], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 36, lineHeight: 38 },
  intro: { marginTop: spacing[4], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 22 },
  tabs: { marginTop: spacing[8], flexDirection: "row", alignItems: "center", gap: spacing[4], borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { minHeight: 44, justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: colors.plum },
  tabText: { color: colors.inkMuted, fontFamily: fontFamilies.bodyMedium, fontSize: 14 },
  tabTextActive: { color: colors.plum },
  savedPanel: { marginTop: spacing[4] },
  collectionStrip: { minHeight: 48, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing[3], borderRadius: radii.control, backgroundColor: colors.lavender[50], paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  collectionTitle: { flex: 1, color: colors.ink, fontFamily: fontFamilies.display, fontSize: 18, lineHeight: 22 },
  count: { color: colors.lavender[700], fontFamily: fontFamilies.bodyMedium, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" },
  stack: { marginTop: spacing[5], gap: spacing[3] },
  status: { marginTop: spacing[8], color: colors.inkMuted, fontFamily: fontFamilies.body },
  notice: { marginTop: spacing[5], borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface, padding: spacing[4] },
  empty: { marginTop: spacing[5], borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.lavender[50], padding: spacing[4] },
  emptyPreview: { height: 90, flexDirection: "row", gap: spacing[3], borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface, padding: spacing[3] },
  emptyPhoto: { width: 78, borderRadius: 7, backgroundColor: colors.lavender[100] },
  emptyLines: { flex: 1, gap: spacing[3], paddingTop: spacing[2] },
  emptyLineLong: { height: 12, width: "76%", borderRadius: 3, backgroundColor: colors.lavender[100] },
  emptyLineShort: { height: 9, width: "54%", borderRadius: 3, backgroundColor: colors.lavender[100] },
  noticeTitle: { marginTop: spacing[4], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 24, lineHeight: 29 },
  noticeCopy: { marginTop: spacing[2], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 21 },
  retry: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginTop: spacing[4], borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radii.control, paddingHorizontal: spacing[4] },
  retryText: { color: colors.plum, fontFamily: fontFamilies.bodySemiBold },
  link: { minHeight: 44, paddingTop: spacing[4], color: colors.plum, fontFamily: fontFamilies.bodySemiBold, fontSize: 14 },
  error: { marginTop: spacing[3], color: colors.roseDust, fontFamily: fontFamilies.bodyMedium, fontSize: 12 },
  smartStack: { marginTop: spacing[4], gap: spacing[3] },
  smartCard: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface, padding: spacing[4] },
  locked: { opacity: 0.68 },
  smartEyebrow: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 9, letterSpacing: 1.2 },
  smartTitle: { marginTop: spacing[1], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 23, lineHeight: 27 },
  smartDescription: { marginTop: spacing[2], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 13, lineHeight: 20 },
  smartCount: { marginTop: spacing[4], color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 12 },
});

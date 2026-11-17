import type { PublicRestaurantDetail, RestaurantVisit } from "@fiyu/contracts";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { createRestaurantVisit, fetchDefaultList, fetchRestaurant, fetchSeenRestaurantIds } from "@/api/client";
import { PICKS_CITY_ID, picksKeys, useLog } from "@/api/queries";
import { AppHeader } from "@/components/navigation/AppHeader";
import { colors, fontFamilies, radii, spacing } from "@/design";
import { newestVisits } from "@/lib/account/presentation";

const today = () => {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export function LogVisitScreen() {
  const queryClient = useQueryClient();
  const log = useLog();
  const seen = useQuery({ queryKey: ["seen-restaurants"], queryFn: fetchSeenRestaurantIds });
  const saved = useQuery({ queryKey: picksKeys.saved, queryFn: () => fetchDefaultList(PICKS_CITY_ID) });
  const loggedIds = useMemo(() => new Set((log.data ?? []).map((visit) => visit.place_id)), [log.data]);
  const candidateIds = useMemo(() => [...new Set([...(seen.data ?? []), ...(saved.data?.items.map((item) => item.place_id) ?? [])])].filter((id) => !loggedIds.has(id)), [loggedIds, saved.data, seen.data]);
  const catalog = useQuery({
    queryKey: ["log", "eligible-restaurants", candidateIds],
    queryFn: async () => (await Promise.allSettled(candidateIds.map(fetchRestaurant)))
      .flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
    enabled: !seen.isLoading && !saved.isLoading && !log.isLoading && candidateIds.length > 0,
  });

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PublicRestaurantDetail | null>(null);
  const [date, setDate] = useState(today);
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [note, setNote] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const results = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (catalog.data ?? []).filter((restaurant) => !term || [restaurant.name_ja, restaurant.name_en, restaurant.category].some((value) => value?.toLocaleLowerCase().includes(term))).slice(0, 7);
  }, [catalog.data, search]);
  const create = useMutation({
    mutationFn: () => createRestaurantVisit({ place_id: selected!.place_id, visited_at: `${date}T12:00:00.000Z`, rating, private_note: note.trim() || null }),
    onSuccess(visit) {
      queryClient.setQueryData<RestaurantVisit[]>(picksKeys.log, (prior = []) => newestVisits([visit, ...prior.filter((item) => item.id !== visit.id)]));
      void queryClient.invalidateQueries({ queryKey: picksKeys.map });
      void queryClient.invalidateQueries({ queryKey: picksKeys.personalized });
      void queryClient.invalidateQueries({ queryKey: picksKeys.smartViews });
      setConfirmation(`${restaurantName(visit.restaurant)} was added to your Log.`);
      setSelected(null); setSearch(""); setDate(today()); setRating(5); setNote(""); setShowResults(false);
    },
  });
  const loadingCandidates = seen.isLoading || saved.isLoading || log.isLoading || catalog.isLoading;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`));
  const canSave = Boolean(selected && validDate && !create.isPending);

  return <SafeAreaView edges={["top"]} style={styles.safe}>
    <AppHeader onOpenMenu={() => router.push("/profile")} />
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.titleRow}><View><Text style={styles.eyebrow}>TOKYO EDITION</Text><Text style={styles.heading}>Log a visit</Text></View><Pressable accessibilityRole="button" onPress={() => router.push("/log/history")} style={styles.history}><Ionicons color={colors.plum} name="time-outline" size={16} /><Text style={styles.historyText}>History</Text></Pressable></View>
        <Text style={styles.intro}>Keep a private record of the places you’ve tried.</Text>

        <View style={styles.field}><Text style={styles.label}>RESTAURANT</Text><View style={styles.inputShell}><Ionicons color={colors.inkFaint} name="search-outline" size={18} /><TextInput accessibilityLabel="Restaurant search" autoCapitalize="none" onChangeText={(value) => { setSearch(value); setSelected(null); setShowResults(true); setConfirmation(null); }} onFocus={() => setShowResults(true)} placeholder="Search places you've seen" placeholderTextColor={colors.inkFaint} style={styles.input} value={selected ? restaurantName(selected) : search} /></View>
          {showResults ? <View style={styles.results}>{loadingCandidates ? <Text style={styles.resultStatus}>Loading places…</Text> : results.length ? results.map((restaurant) => <Pressable accessibilityRole="button" key={restaurant.place_id} onPress={() => { setSelected(restaurant); setSearch(restaurantName(restaurant)); setShowResults(false); }} style={({ pressed }) => [styles.result, pressed && styles.resultPressed]}><Text style={styles.resultTitle}>{restaurantName(restaurant)}</Text><Text style={styles.resultMeta}>{[restaurant.name_en !== restaurantName(restaurant) ? restaurant.name_en : null, restaurant.category].filter(Boolean).join(" · ")}</Text></Pressable>) : <Text style={styles.resultStatus}>No eligible places found.</Text>}</View> : null}
        </View>

        <View style={styles.field}><Text style={styles.label}>VISIT DATE</Text><View style={styles.inputShell}><Ionicons color={colors.inkFaint} name="calendar-outline" size={18} /><TextInput accessibilityLabel="Visit date" keyboardType="numbers-and-punctuation" maxLength={10} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkFaint} style={styles.input} value={date} /></View>{date && !validDate ? <Text accessibilityRole="alert" style={styles.error}>Use YYYY-MM-DD.</Text> : null}</View>
        <View style={styles.field}><Text style={styles.label}>HOW WAS IT?</Text><View accessibilityRole="radiogroup" style={styles.stars}>{([1, 2, 3, 4, 5] as const).map((value) => <Pressable accessibilityLabel={`${value} star${value === 1 ? "" : "s"}`} accessibilityRole="radio" accessibilityState={{ checked: rating === value }} hitSlop={4} key={value} onPress={() => setRating(value)}><Text style={[styles.star, value <= rating && styles.starSelected]}>★</Text></Pressable>)}</View></View>
        <View style={styles.field}><View style={styles.noteLabel}><Text style={styles.label}>PRIVATE NOTE (OPTIONAL)</Text><Ionicons color={colors.inkFaint} name="lock-closed-outline" size={13} /></View><TextInput accessibilityLabel="Private note" multiline onChangeText={setNote} placeholder="Something you want to remember…" placeholderTextColor={colors.inkFaint} style={[styles.inputShell, styles.noteInput]} textAlignVertical="top" value={note} /><Text style={styles.hint}>Only you can see this. Notes never appear on a restaurant page.</Text></View>
        {confirmation ? <Text accessibilityRole="alert" style={styles.confirmation}>{confirmation}</Text> : null}{create.isError ? <Text accessibilityRole="alert" style={styles.error}>Your visit could not be saved. Please try again.</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSave }} disabled={!canSave} onPress={() => create.mutate()} style={({ pressed }) => [styles.save, !canSave && styles.saveDisabled, pressed && styles.savePressed]}><Text style={styles.saveText}>{create.isPending ? "Saving…" : "Save visit"}</Text></Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function restaurantName(restaurant: { name_ja?: string | null; name_en?: string | null }) { return restaurant.name_ja || restaurant.name_en || "Restaurant"; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, flex: { flex: 1 }, content: { padding: spacing[5], paddingBottom: spacing[12] },
  titleRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing[4] }, eyebrow: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 10, letterSpacing: 1.6 }, heading: { marginTop: spacing[2], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 36 }, history: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing[1] }, historyText: { color: colors.plum, fontFamily: fontFamilies.bodySemiBold, fontSize: 13 }, intro: { marginTop: spacing[2], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 21 },
  field: { marginTop: spacing[8] }, label: { color: colors.inkMuted, fontFamily: fontFamilies.bodySemiBold, fontSize: 10, letterSpacing: 1.3 }, inputShell: { minHeight: 48, marginTop: spacing[2], flexDirection: "row", alignItems: "center", gap: spacing[2], borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radii.control, backgroundColor: colors.surface, paddingHorizontal: spacing[3] }, input: { flex: 1, color: colors.ink, fontFamily: fontFamilies.body, fontSize: 15, paddingVertical: spacing[3] },
  results: { marginTop: spacing[1], overflow: "hidden", borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface }, result: { minHeight: 54, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingHorizontal: spacing[4], paddingVertical: spacing[2] }, resultPressed: { backgroundColor: colors.subtle }, resultTitle: { color: colors.ink, fontFamily: fontFamilies.bodyMedium, fontSize: 14 }, resultMeta: { marginTop: 2, color: colors.inkFaint, fontFamily: fontFamilies.body, fontSize: 11 }, resultStatus: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 13, padding: spacing[4] },
  stars: { marginTop: spacing[2], flexDirection: "row", alignItems: "center", gap: spacing[2] }, star: { color: colors.lineStrong, fontSize: 34, lineHeight: 40 }, starSelected: { color: colors.lavender[600] }, noteLabel: { flexDirection: "row", alignItems: "center", gap: spacing[1] }, noteInput: { minHeight: 112, color: colors.ink, fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 21, paddingTop: spacing[3] }, hint: { marginTop: spacing[2], color: colors.inkFaint, fontFamily: fontFamilies.body, fontSize: 11, lineHeight: 16 },
  error: { marginTop: spacing[2], color: colors.roseDust, fontFamily: fontFamilies.bodyMedium, fontSize: 12 }, confirmation: { marginTop: spacing[5], color: colors.lavender[700], fontFamily: fontFamilies.bodyMedium, fontSize: 13 }, save: { minHeight: 52, marginTop: spacing[8], alignItems: "center", justifyContent: "center", borderRadius: radii.control, backgroundColor: colors.lavender[600] }, saveDisabled: { opacity: 0.45 }, savePressed: { opacity: 0.82 }, saveText: { color: colors.surface, fontFamily: fontFamilies.bodySemiBold, fontSize: 15 },
});

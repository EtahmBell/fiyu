import type { TogetherInviteCreated, TogetherSession, TogetherState } from "@fiyu/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cancelTogetherInvite, createTogetherInvite, rotateTogetherInvite } from "@/api/client";
import { picksKeys, useTogetherState } from "@/api/queries";
import { RevealedPickCard } from "@/components/picks/PickCard";
import { useRestaurantRelationships } from "@/components/restaurant/useRestaurantRelationships";
import { colors, fontFamilies, radii, spacing } from "@/design";
import { copyTogetherInvite, shareTogetherInvite } from "@/lib/nativeShare";
import { activeTogetherSessions, togetherPartnerName } from "@/lib/together";

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function TogetherHub({ onBack, onOpenSession, onOpenRestaurant }: {
  onBack(): void;
  onOpenSession(sessionId: string): void;
  onOpenRestaurant(placeId: string): void;
}) {
  const query = useTogetherState();
  const queryClient = useQueryClient();
  const relationships = useRestaurantRelationships();
  const [notice, setNotice] = useState<string | null>(null);
  const createGuard = useRef(false);
  const state = query.data;
  const sessions = activeTogetherSessions(state?.current_sessions ?? []);
  const pending = state?.session?.status === "pending" ? state.session : null;

  const updateState = (next: TogetherState) => queryClient.setQueryData(picksKeys.together, next);
  const shareCreated = async (created: TogetherInviteCreated) => {
    const result = await shareTogetherInvite(created.invite_url);
    if (result === "shared") setNotice("Invite ready to share.");
  };
  const create = useMutation({
    mutationFn: createTogetherInvite,
    onSuccess: async (created) => {
      if (state) updateState({ ...state, session: created.session, can_initiate: false });
      await shareCreated(created);
    },
    onError: (error) => setNotice(readableError(error, "Together is unavailable right now.")),
    onSettled: () => { createGuard.current = false; },
  });
  const rotate = useMutation({
    mutationFn: (sessionId: string) => rotateTogetherInvite(sessionId),
    onSuccess: shareCreated,
    onError: (error) => setNotice(readableError(error, "The invite could not be shared.")),
  });
  const copy = useMutation({
    mutationFn: async (sessionId: string) => {
      const created = await rotateTogetherInvite(sessionId);
      await copyTogetherInvite(created.invite_url);
      return created;
    },
    onSuccess: () => setNotice("Invite link copied."),
    onError: (error) => setNotice(readableError(error, "The invite could not be copied.")),
  });
  const cancel = useMutation({
    mutationFn: (sessionId: string) => cancelTogetherInvite(sessionId),
    onSuccess: async () => {
      setNotice("Invitation cancelled.");
      await query.refetch();
    },
    onError: (error) => setNotice(readableError(error, "The invite could not be cancelled.")),
  });

  const busy = create.isPending || rotate.isPending || copy.isPending || cancel.isPending;
  const start = () => {
    if (createGuard.current) return;
    createGuard.current = true;
    create.mutate();
  };
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page} refreshControl={undefined}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to Picks" onPress={onBack} style={styles.back}><Text style={styles.backText}>← Picks</Text></Pressable>
    <Text style={styles.eyebrow}>FIYU TOGETHER</Text>
    <Text style={styles.title}>Together</Text>
    <Text style={styles.lead}>Three Picks, chosen around your shared taste.</Text>
    {query.isLoading && !state ? <ActivityIndicator style={styles.loading} color={colors.lavender[600]} /> : null}
    {query.isError && !state ? <View style={styles.message}><Text accessibilityRole="alert" style={styles.muted}>Together is unavailable right now.</Text><Pressable onPress={() => void query.refetch()} style={styles.primary}><Text style={styles.primaryText}>Try again</Text></Pressable></View> : null}
    {pending ? <PendingInvitation session={pending} busy={busy} onShare={() => rotate.mutate(pending.session_id)} onCopy={() => copy.mutate(pending.session_id)} onCancel={() => cancel.mutate(pending.session_id)} /> : null}
    {sessions.map((session) => <SessionSection key={session.session_id} session={session} relationships={relationships} onOpenSession={onOpenSession} onOpenRestaurant={onOpenRestaurant} />)}
    {state && !pending && sessions.length === 0 ? <View style={styles.intro}><Text style={styles.sectionTitle}>Find somewhere that works for both of you.</Text>{state.block_reason === "ratings_required" ? <Text style={styles.muted}>Rate {Math.max(state.ratings_required - state.rated_visit_count, 0)} more visits to unlock Fiyu Together.</Text> : state.block_reason === "cycle_limit_reached" ? <Text style={styles.muted}>That’s every Together for this cycle. New Picks bring new ones.</Text> : <Pressable accessibilityRole="button" disabled={busy || !state.can_initiate} onPress={start} style={[styles.primary, (busy || !state.can_initiate) && styles.disabled]}><Text style={styles.primaryText}>{create.isPending ? "Starting…" : "Start Together"}</Text></Pressable>}</View> : null}
    {state?.can_initiate && !pending && sessions.length > 0 ? <Pressable accessibilityRole="button" disabled={busy} onPress={start} style={styles.startAnother}><Text style={styles.linkText}>Start another Together →</Text></Pressable> : null}
    {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
  </ScrollView></SafeAreaView>;
}

function PendingInvitation({ session, busy, onShare, onCopy, onCancel }: { session: TogetherSession; busy: boolean; onShare(): void; onCopy(): void; onCancel(): void }) {
  return <View style={styles.panel}><Text style={styles.sectionTitle}>Waiting for someone to join</Text><Text style={styles.muted}>Your Together starts as soon as they open the invite.</Text><View style={styles.actionRow}><Pressable accessibilityRole="button" disabled={busy} onPress={onShare} style={styles.secondary}><Text style={styles.secondaryText}>Share invite</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={onCopy} style={styles.secondary}><Text style={styles.secondaryText}>Copy link</Text></Pressable></View><Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.cancel}><Text style={styles.muted}>Cancel invitation</Text></Pressable></View>;
}

function SessionSection({ session, relationships, onOpenSession, onOpenRestaurant }: { session: TogetherSession; relationships: ReturnType<typeof useRestaurantRelationships>; onOpenSession(id: string): void; onOpenRestaurant(id: string): void }) {
  return <View style={styles.session}><Text style={styles.sessionEyebrow}>TOGETHER WITH {togetherPartnerName(session).toUpperCase()}</Text><Text style={styles.sectionTitle}>{session.pick_count} active Picks</Text>{session.reveal_pending ? <View style={styles.hidden}><Text style={styles.hiddenTitle}>Your Fiyu Together is ready.</Text><Text style={styles.muted}>Three restaurant identities stay hidden until you reveal them.</Text><Pressable accessibilityRole="button" accessibilityLabel="Reveal our Picks" onPress={() => onOpenSession(session.session_id)} style={styles.primary}><Text style={styles.primaryText}>Reveal our Picks →</Text></Pressable></View> : session.restaurants.map((restaurant) => <View key={restaurant.place_id} style={styles.result}><RevealedPickCard restaurant={restaurant} saved={relationships.savedIds.has(restaurant.place_id)} visited={relationships.visitsByPlace.has(restaurant.place_id)} savePending={relationships.savePendingPlaceId === restaurant.place_id} tone="together" photoEnabled={false} showLog={false} onOpen={() => onOpenRestaurant(restaurant.place_id)} onSave={() => relationships.toggleSaved(restaurant.place_id)} onLog={() => undefined} /></View>)}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas }, page: { padding: spacing[5], paddingBottom: spacing[12] }, back: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center" }, backText: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 14 },
  eyebrow: { marginTop: spacing[4], color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 10, letterSpacing: 1.8 }, title: { marginTop: spacing[2], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 42 }, lead: { marginTop: spacing[2], color: colors.inkBody, fontFamily: fontFamilies.body, fontSize: 14 }, loading: { marginTop: spacing[10] },
  panel: { marginTop: spacing[6], borderWidth: 1, borderColor: colors.lavender[200], borderRadius: radii.card, backgroundColor: colors.surface, padding: spacing[5] }, intro: { marginTop: spacing[8] }, sectionTitle: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 25, lineHeight: 30 }, muted: { marginTop: spacing[2], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 21 },
  primary: { alignSelf: "flex-start", minHeight: 46, justifyContent: "center", marginTop: spacing[5], borderRadius: radii.control, backgroundColor: colors.plum, paddingHorizontal: spacing[5] }, primaryText: { color: colors.surface, fontFamily: fontFamilies.bodySemiBold, fontSize: 14 }, disabled: { opacity: 0.55 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2], marginTop: spacing[5] }, secondary: { minHeight: 44, justifyContent: "center", borderWidth: 1, borderColor: colors.lavender[200], borderRadius: radii.control, paddingHorizontal: spacing[4] }, secondaryText: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 13 }, cancel: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", marginTop: spacing[2] },
  session: { marginTop: spacing[8], paddingTop: spacing[4], borderTopWidth: 1, borderTopColor: colors.line }, sessionEyebrow: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 9, letterSpacing: 1.3 }, hidden: { marginTop: spacing[4], borderRadius: radii.card, backgroundColor: colors.lavender[50], padding: spacing[5] }, hiddenTitle: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 23 }, result: { marginTop: spacing[4] },
  startAnother: { minHeight: 48, justifyContent: "center", marginTop: spacing[6], borderTopWidth: 1, borderTopColor: colors.line }, linkText: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 14 }, notice: { marginTop: spacing[4], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 12 }, message: { marginTop: spacing[8] },
});

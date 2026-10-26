import type { MyPick, MyPickQuota } from "@fiyu/contracts";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useMyPickResources } from "@/api/queries";
import { RevealCard } from "@/components/picks/RevealCard";
import { VisitModal } from "@/components/picks/VisitModal";
import { ScoreMark } from "@/components/restaurant/ScoreMark";
import { useRestaurantRelationships } from "@/components/restaurant/useRestaurantRelationships";
import { colors, fontFamilies, radii, spacing } from "@/design";
import { MyPickComposer } from "./MyPickComposer";

const PENDING = new Set<MyPick["status"]>(["pending", "resolving_identity", "researching"]);

export function isMyPickResultReady(item: MyPick): boolean {
  return item.result_ready || (item.fiyu_score !== null && item.score_version !== null);
}

function safeName(item: MyPick): string {
  return item.name_en?.trim() || item.name_ja?.trim() || "Your Pick";
}

function Footer({ quota, onSubmit }: { quota: MyPickQuota | null; onSubmit(): void }) {
  return <View testID="my-pick-footer" style={styles.footer}><Text style={styles.footerCopy}>{quota ? `${quota.remaining} of ${quota.limit} Picks left` : "Checking Picks availability…"}</Text>{quota && quota.remaining > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Submit another My Pick" onPress={onSubmit} style={styles.footerAction}><Text style={styles.footerActionText}>Submit another →</Text></Pressable> : null}</View>;
}

function PendingCard({ item, footer }: { item: MyPick; footer?: ReactNode }) {
  const label = item.user_name_hint?.trim();
  return <View style={styles.card}><Text style={styles.eyebrow}>YOUR PICK</Text><Text style={styles.title}>{label ? `${label} is under review` : "Your Pick is under review"}</Text><Text style={styles.copy}>Fiyu is looking into it. We’ll let you know when it’s ready.</Text>{footer}</View>;
}

function ReadyCard({ item, footer, saved, visited, onOpenRestaurant, onSave, onLog }: { item: MyPick; footer?: ReactNode; saved: boolean; visited: boolean; onOpenRestaurant(placeId: string): void; onSave(): void; onLog(): void }) {
  const [revealed, setRevealed] = useState(false);
  const key = `fiyu.native.my-pick-revealed.${item.my_pick_id}`;
  useEffect(() => { let active = true; void SecureStore.getItemAsync(key).then((value) => { if (active) setRevealed(value === "true"); }); return () => { active = false; }; }, [key]);
  const reveal = async () => { await SecureStore.setItemAsync(key, "true"); setRevealed(true); };
  const face = <View style={styles.readyFace}><View style={styles.readyHeader}><View style={styles.readyTitle}><Text style={styles.eyebrow}>YOUR PICK</Text><Text style={styles.title}>{safeName(item)}</Text>{item.name_ja && item.name_ja !== safeName(item) ? <Text style={styles.secondary}>{item.name_ja}</Text> : null}{item.primary_category || item.display_area ? <Text style={styles.secondary}>{[item.primary_category, item.display_area].filter(Boolean).join(" · ")}</Text> : null}</View><ScoreMark score={item.fiyu_score} accentColor="#8296AA" /></View>{!item.is_public ? <Text style={styles.privateCopy}>This is your private result. It is not currently part of the public Fiyu catalog.</Text> : null}{item.is_public && item.place_id ? <View style={styles.publicActions}><Pressable accessibilityRole="button" onPress={() => onOpenRestaurant(item.place_id!)} style={styles.viewAction}><Text style={styles.viewActionText}>View restaurant →</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ selected: saved }} onPress={onSave} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>{saved ? "Saved" : "Save"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ selected: visited, disabled: visited }} disabled={visited} onPress={onLog} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>{visited ? "Visited" : "Log"}</Text></Pressable></View> : null}</View>;
  return <View testID="my-pick-ready-card" style={styles.readyCard}><RevealCard revealed={revealed} label="Reveal your Pick" onReveal={reveal} concealed={<View style={styles.concealed}><View style={styles.topRule} /><Text style={styles.eyebrow}>YOUR PICK IS READY</Text><Text style={styles.concealedBrand}>Fiyu</Text><Text style={styles.revealText}>Reveal your Pick →</Text></View>}>{face}</RevealCard>{footer ? <View style={styles.readyFooter}>{footer}</View> : null}</View>;
}

function StatusCard({ item, footer }: { item: MyPick; footer?: ReactNode }) {
  const copy = item.status === "failed_retryable" ? "Fiyu couldn’t finish checking this one yet. Your request is saved and can be retried." : item.status === "outside_coverage" ? "This restaurant is outside Fiyu’s current Tokyo coverage." : "Fiyu couldn’t complete this Pick yet. Your request is still saved.";
  return <View style={styles.card}><Text style={styles.eyebrow}>YOUR PICK</Text><Text style={styles.title}>{safeName(item)}</Text><Text style={styles.copy}>{copy}</Text>{footer}</View>;
}

export function MyPickSection({ initialMyPickId, onOpenRestaurant }: { initialMyPickId?: string; onOpenRestaurant(placeId: string): void }) {
  const resources = useMyPickResources();
  const relationships = useRestaurantRelationships();
  const [composerOpen, setComposerOpen] = useState(false);
  const [visitTarget, setVisitTarget] = useState<MyPick | null>(null);
  const allItems = resources.picks.data ?? [];
  const recent = allItems.slice(0, 3);
  const linked = initialMyPickId ? allItems.find((item) => item.my_pick_id === initialMyPickId) : undefined;
  const items = linked && !recent.some((item) => item.my_pick_id === linked.my_pick_id) ? [linked, ...recent.slice(0, 2)] : recent;
  const quota = resources.quota.data ?? null;
  const footer = <Footer quota={quota} onSubmit={() => setComposerOpen(true)} />;
  return <View style={styles.section} testID="my-pick-section">
    {items.length === 0 && !resources.picks.isLoading ? <Pressable accessibilityRole="button" onPress={() => setComposerOpen(true)} style={styles.entry}><Text style={styles.entryTitle}>Try My Pick</Text><Text style={styles.copy}>Give Fiyu a restaurant and we’ll score it.</Text><Text style={styles.entryAction}>Submit a restaurant →</Text></Pressable> : null}
    {items.map((item, index) => <View key={item.my_pick_id} style={index > 0 ? styles.cardSpacing : undefined}>{PENDING.has(item.status) ? <PendingCard item={item} footer={index === 0 ? footer : undefined} /> : isMyPickResultReady(item) ? <ReadyCard item={item} footer={index === 0 ? footer : undefined} saved={item.place_id ? relationships.savedIds.has(item.place_id) : false} visited={item.place_id ? relationships.visitsByPlace.has(item.place_id) : false} onOpenRestaurant={onOpenRestaurant} onSave={() => { if (item.is_public && item.place_id) relationships.toggleSaved(item.place_id); }} onLog={() => { if (item.is_public && item.place_id) setVisitTarget(item); }} /> : <StatusCard item={item} footer={index === 0 ? footer : undefined} />}</View>)}
    {resources.picks.error ? <Text accessibilityRole="alert" style={styles.error}>Your Picks could not connect.</Text> : null}
    <MyPickComposer visible={composerOpen} quota={quota} onClose={() => setComposerOpen(false)} />
    <VisitModal name={visitTarget ? safeName(visitTarget) : null} pending={relationships.visitPendingPlaceId !== null} error={relationships.visitError} onClose={() => !relationships.visitPendingPlaceId && setVisitTarget(null)} onSubmit={(rating, note) => { if (visitTarget?.place_id) relationships.logVisit(visitTarget.place_id, rating, note, () => setVisitTarget(null)); }} />
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: spacing[6] }, cardSpacing: { marginTop: spacing[3] }, card: { borderWidth: 1, borderColor: "#D2DAE5", borderRadius: radii.card, backgroundColor: "#EEF2F6", padding: spacing[5] }, entry: { borderWidth: 1, borderColor: "#D2DAE5", borderRadius: radii.card, backgroundColor: "#EEF2F6", padding: spacing[5] }, entryTitle: { color: "#3F4A59", fontFamily: fontFamilies.display, fontSize: 27 }, entryAction: { marginTop: spacing[4], color: "#5F7287", fontFamily: fontFamilies.bodySemiBold, fontSize: 14 }, eyebrow: { color: "#5F7287", fontFamily: fontFamilies.bodySemiBold, fontSize: 10, letterSpacing: 1.7 }, title: { marginTop: spacing[2], color: "#3F4A59", fontFamily: fontFamilies.display, fontSize: 24, lineHeight: 29 }, copy: { marginTop: spacing[2], color: colors.inkBody, fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 22 }, secondary: { marginTop: 3, color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 12 }, footer: { minHeight: 50, marginTop: spacing[4], paddingTop: spacing[2], borderTopWidth: 1, borderTopColor: "#D2DAE5", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing[3] }, footerCopy: { flex: 1, color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 13 }, footerAction: { minHeight: 44, justifyContent: "center" }, footerActionText: { color: colors.plum, fontFamily: fontFamilies.bodySemiBold, fontSize: 13 }, concealed: { minHeight: 190, justifyContent: "center", alignItems: "center", backgroundColor: "#E6EDF5", padding: spacing[5] }, topRule: { position: "absolute", top: 0, left: 0, right: 0, height: 3, backgroundColor: "#8296AA" }, concealedBrand: { marginTop: spacing[4], color: "#3F4A59", fontFamily: fontFamilies.display, fontSize: 34 }, revealText: { marginTop: spacing[5], color: "#5F7287", fontFamily: fontFamilies.bodySemiBold, fontSize: 14 }, readyCard: { overflow: "hidden", borderWidth: 1, borderColor: "#D2DAE5", borderRadius: radii.card, backgroundColor: "#EEF2F6" }, readyFace: { padding: spacing[5] }, readyFooter: { paddingHorizontal: spacing[5], paddingBottom: spacing[2] }, readyHeader: { flexDirection: "row", gap: spacing[3] }, readyTitle: { flex: 1 }, privateCopy: { marginTop: spacing[3], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 13, lineHeight: 20 }, publicActions: { marginTop: spacing[3], flexDirection: "row", alignItems: "center", gap: spacing[2] }, viewAction: { flex: 1, minHeight: 44, justifyContent: "center" }, viewActionText: { color: colors.plum, fontFamily: fontFamilies.bodySemiBold, fontSize: 14 }, secondaryAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing[2] }, secondaryActionText: { color: "#5F7287", fontFamily: fontFamilies.bodySemiBold, fontSize: 13 }, error: { marginTop: spacing[3], color: colors.roseDust, fontFamily: fontFamilies.bodyMedium, fontSize: 13 },
});

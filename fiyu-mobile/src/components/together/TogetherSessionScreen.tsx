import type { TogetherSession } from "@fiyu/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { revealTogetherSession } from "@/api/client";
import { picksKeys, useTogetherSession } from "@/api/queries";
import { RevealCard } from "@/components/picks/RevealCard";
import { colors, fontFamilies, radii, spacing } from "@/design";
import { togetherPartnerName } from "@/lib/together";

export function TogetherSessionScreen({ sessionId, onRevealed, onBack }: { sessionId: string; onRevealed(sessionId: string): void; onBack(): void }) {
  const query = useTogetherSession(sessionId);
  const queryClient = useQueryClient();
  const reveal = useMutation({
    mutationFn: () => revealTogetherSession(sessionId),
    onSuccess: async (session) => {
      queryClient.setQueryData(picksKeys.togetherSession(sessionId), session);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: picksKeys.together }),
        queryClient.invalidateQueries({ queryKey: picksKeys.recent }),
        queryClient.invalidateQueries({ queryKey: picksKeys.map }),
      ]);
      onRevealed(sessionId);
    },
  });
  const session = query.data;
  useEffect(() => {
    if (session?.status === "generated" && !session.reveal_pending) onRevealed(sessionId);
  }, [onRevealed, session?.reveal_pending, session?.status, sessionId]);
  if (session && session.status === "generated" && !session.reveal_pending) return null;
  return <SafeAreaView style={styles.safe}><View style={styles.page}>
    {query.isLoading && !session ? <><ActivityIndicator color={colors.lavender[200]} /><Text style={styles.muted}>Opening your Together…</Text></> : null}
    {session?.reveal_pending ? <RevealMoment session={session} busy={reveal.isPending} onReveal={() => reveal.mutateAsync()} /> : null}
    {query.isError && !session ? <><Text accessibilityRole="alert" style={styles.title}>Together is unavailable.</Text><Text style={styles.muted}>This session may no longer be available.</Text><Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={styles.backText}>Return to Together</Text></Pressable></> : null}
    {reveal.error ? <Text accessibilityRole="alert" style={styles.error}>Together could not be revealed. Try again.</Text> : null}
  </View></SafeAreaView>;
}

function RevealMoment({ session, busy, onReveal }: { session: TogetherSession; busy: boolean; onReveal(): Promise<unknown> }) {
  const partner = togetherPartnerName(session);
  return <View style={styles.moment}><Text style={styles.eyebrow}>FIYU TOGETHER</Text><Text accessibilityLabel={`You and ${partner}`} style={styles.pair}>YOU <Text style={styles.pairAccent}>×</Text> {partner.toUpperCase()}</Text><Text style={styles.title}>Your Fiyu Together{`\n`}is ready.</Text><Text style={styles.muted}>{session.pick_count === 3 ? "Three" : session.pick_count} places chosen for both of you.</Text><View style={styles.revealWrap}><RevealCard revealed={false} busy={busy} label="Reveal our Picks" onReveal={onReveal} concealed={<View style={styles.revealButton}><Text style={styles.revealText}>{busy ? "Revealing…" : "Reveal our Picks"}</Text></View>}><View /></RevealCard></View></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.plum }, page: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing[6] }, moment: { width: "100%", alignItems: "center" }, eyebrow: { color: colors.lavender[200], fontFamily: fontFamilies.bodySemiBold, fontSize: 10, letterSpacing: 1.8 }, pair: { marginTop: spacing[8], color: colors.surface, fontFamily: fontFamilies.bodySemiBold, fontSize: 12, letterSpacing: 1.1, textAlign: "center" }, pairAccent: { color: colors.lavender[200], fontFamily: fontFamilies.display, fontSize: 23 }, title: { marginTop: spacing[6], color: colors.surface, fontFamily: fontFamilies.display, fontSize: 38, lineHeight: 43, textAlign: "center" }, muted: { marginTop: spacing[4], color: colors.lavender[100], fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 22, textAlign: "center" }, revealWrap: { width: "100%", marginTop: spacing[8] }, revealButton: { minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: radii.control, backgroundColor: colors.surface }, revealText: { color: colors.plum, fontFamily: fontFamilies.bodySemiBold, fontSize: 14 }, back: { minHeight: 48, justifyContent: "center", marginTop: spacing[6] }, backText: { color: colors.lavender[100], fontFamily: fontFamilies.bodyMedium, fontSize: 14, textDecorationLine: "underline" }, error: { marginTop: spacing[5], color: colors.roseDust, fontFamily: fontFamilies.bodyMedium, fontSize: 13, textAlign: "center" },
});

import type { TogetherState } from "@fiyu/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { createTogetherInvite } from "@/api/client";
import { picksKeys } from "@/api/queries";
import { colors, fontFamilies, radii, spacing } from "@/design";
import { shareTogetherInvite } from "@/lib/nativeShare";
import { togetherEntryState, togetherPartnerName } from "@/lib/together";

export function TogetherEntry({ state, onOpenSession, onOpenHub }: {
  state: TogetherState;
  onOpenSession(sessionId: string): void;
  onOpenHub(): void;
}) {
  const queryClient = useQueryClient();
  const createGuard = useRef(false);
  const entry = togetherEntryState(state);
  const create = useMutation({
    mutationFn: createTogetherInvite,
    onSuccess: async (created) => {
      queryClient.setQueryData<TogetherState>(picksKeys.together, (prior) => prior ? { ...prior, session: created.session, can_initiate: false } : prior);
      await shareTogetherInvite(created.invite_url);
    },
    onSettled: () => { createGuard.current = false; },
  });
  const startInvite = () => {
    if (createGuard.current) return;
    createGuard.current = true;
    create.mutate();
  };

  let headline = "Find three Picks with someone.";
  let detail: string | null = null;
  let action: string | null = null;
  let onPress: (() => void) | undefined;
  if (entry.kind === "ready") {
    headline = `Your Together with ${togetherPartnerName(entry.session)} is ready`;
    detail = `${entry.session.pick_count} Picks are waiting`;
    action = "Reveal →";
    onPress = () => onOpenSession(entry.session.session_id);
  } else if (entry.kind === "active") {
    const names = [...new Set(entry.sessions.map(togetherPartnerName))];
    headline = names.join(" · ");
    const total = entry.sessions.reduce((sum, session) => sum + session.pick_count, 0);
    detail = names.length > 1 ? `${names.length} Togethers` : entry.sessions.length === 1 ? `${total} Picks together` : `${total} active Picks`;
    action = "View →";
    onPress = onOpenHub;
  } else if (entry.kind === "pending") {
    headline = "Waiting for someone to join";
    detail = "Your invite is out.";
    action = "View →";
    onPress = onOpenHub;
  } else if (entry.kind === "eligible") {
    action = create.isPending ? "Inviting…" : "Invite someone →";
    onPress = startInvite;
  } else if (entry.kind === "ratings_required") {
    detail = `Review ${entry.remaining} more restaurant${entry.remaining === 1 ? "" : "s"} to unlock.`;
  } else if (entry.kind === "cycle_limit") {
    detail = "That’s every Together for this cycle. New Picks bring new ones.";
  } else {
    return null;
  }

  return <EntrySurface headline={headline} detail={detail} action={action} error={create.error ? "Together is unavailable right now." : null} disabled={create.isPending} onPress={onPress} />;
}

function EntrySurface({ headline, detail, action, error, disabled, onPress }: { headline: string; detail: string | null; action: string | null; error: string | null; disabled: boolean; onPress?: () => void }) {
  const body = <View style={styles.row}><View style={styles.copy}><Text style={styles.eyebrow}>FIYU TOGETHER</Text><Text style={styles.headline}>{headline}</Text>{detail ? <Text style={styles.detail}>{detail}</Text> : null}{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</View>{action ? <Text style={styles.action}>{action}</Text> : null}</View>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel="Fiyu Together" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>{body}</Pressable> : <View accessibilityLabel="Fiyu Together" style={styles.card}>{body}</View>;
}

const styles = StyleSheet.create({
  card: { marginTop: spacing[6], minHeight: 96, justifyContent: "center", borderWidth: 1, borderColor: "#E4D7E7", borderRadius: radii.card, backgroundColor: "#FAF5FA", padding: spacing[5] },
  pressed: { backgroundColor: "#F0E7F2", transform: [{ scale: 0.995 }] },
  row: { flexDirection: "row", alignItems: "center", gap: spacing[4] },
  copy: { flex: 1 },
  eyebrow: { color: "#6B3F75", fontFamily: fontFamilies.bodySemiBold, fontSize: 9, letterSpacing: 1.5 },
  headline: { marginTop: spacing[1], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 20, lineHeight: 24 },
  detail: { marginTop: 2, color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 12, lineHeight: 17 },
  action: { color: "#6B3F75", fontFamily: fontFamilies.bodySemiBold, fontSize: 13 },
  error: { marginTop: spacing[2], color: colors.roseDust, fontFamily: fontFamilies.body, fontSize: 12 },
});

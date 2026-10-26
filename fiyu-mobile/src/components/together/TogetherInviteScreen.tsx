import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { acceptTogetherInvite, fetchTogetherInvite } from "@/api/client";
import { picksKeys } from "@/api/queries";
import { useAuth } from "@/auth/AuthProvider";
import { colors, fontFamilies, radii, spacing } from "@/design";

export function TogetherInviteScreen({ token, autoJoin, onSignIn, onSignUp, onJoined, onGoToFiyu }: {
  token: string;
  autoJoin: boolean;
  onSignIn(returnTo: string): void;
  onSignUp(returnTo: string): void;
  onJoined(sessionId: string): void;
  onGoToFiyu(): void;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const resumed = useRef(false);
  const preview = useQuery({ queryKey: ["together", "invite", token], queryFn: () => fetchTogetherInvite(token), retry: false, enabled: token.length > 0 });
  const join = useMutation({
    mutationFn: () => acceptTogetherInvite(token),
    onSuccess: async (session) => {
      queryClient.setQueryData(picksKeys.togetherSession(session.session_id), session);
      await queryClient.invalidateQueries({ queryKey: picksKeys.together });
      onJoined(session.session_id);
    },
  });
  useEffect(() => {
    if (!autoJoin || resumed.current || auth.status !== "authenticated" || preview.data?.status !== "pending" || preview.data.is_own_invite) return;
    resumed.current = true;
    join.mutate();
  }, [auth.status, autoJoin, join, preview.data]);

  const invite = preview.data;
  const name = invite?.initiator?.display_name ?? "Someone";
  const returnTo = `/together/${encodeURIComponent(token)}?join=1`;
  const unavailable = invite && invite.status !== "pending";
  return <SafeAreaView style={styles.safe}><View style={styles.page} accessibilityViewIsModal>
    <Text style={styles.eyebrow}>FIYU TOGETHER</Text>
    {preview.isLoading ? <><ActivityIndicator style={styles.loading} color={colors.lavender[200]} /><Text style={styles.muted}>Opening invitation…</Text></> : null}
    {invite?.status === "pending" && invite.is_own_invite ? <><Text style={styles.mark}>F × ·</Text><Text style={styles.title}>This is your own Fiyu Together invite.</Text><Text style={styles.muted}>Send the original link to someone else to get started.</Text><Pressable accessibilityRole="button" onPress={onGoToFiyu} style={styles.secondary}><Text style={styles.secondaryText}>Return to Fiyu</Text></Pressable></> : null}
    {invite?.status === "pending" && !invite.is_own_invite ? <><Text accessibilityLabel={`Invitation from ${name}`} style={styles.avatar}>{name.slice(0, 1).toUpperCase()}</Text><Text style={styles.title}>{name} wants to find somewhere with you.</Text><Text style={styles.muted}>Three Picks, chosen for both of you.</Text>{auth.status === "authenticated" ? <Pressable accessibilityRole="button" disabled={join.isPending} onPress={() => join.mutate()} style={[styles.primary, join.isPending && styles.disabled]}><Text style={styles.primaryText}>{join.isPending ? "Joining…" : `Join ${name}`}</Text></Pressable> : auth.status === "unauthenticated" ? <><Pressable accessibilityRole="button" onPress={() => onSignIn(returnTo)} style={styles.primary}><Text style={styles.primaryText}>Sign in to join</Text></Pressable><Pressable accessibilityRole="button" onPress={() => onSignUp(returnTo)} style={styles.signup}><Text style={styles.signupText}>Create account</Text></Pressable></> : null}</> : null}
    {unavailable ? <><Text style={styles.title}>This invitation is no longer available.</Text><Text style={styles.muted}>Ask for a new Fiyu Together link.</Text><Pressable accessibilityRole="button" onPress={onGoToFiyu} style={styles.secondary}><Text style={styles.secondaryText}>Go to Fiyu</Text></Pressable></> : null}
    {preview.isError ? <><Text accessibilityRole="alert" style={styles.title}>This invitation is unavailable.</Text><Text style={styles.muted}>The link may be invalid. Ask for a new Fiyu Together invite.</Text><Pressable accessibilityRole="button" onPress={onGoToFiyu} style={styles.secondary}><Text style={styles.secondaryText}>Go to Fiyu</Text></Pressable></> : null}
    {join.error ? <Text accessibilityRole="alert" style={styles.error}>This invitation could not be accepted. It may no longer be available.</Text> : null}
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.plum }, page: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing[6] }, eyebrow: { color: colors.lavender[200], fontFamily: fontFamilies.bodySemiBold, fontSize: 10, letterSpacing: 1.8 }, loading: { marginTop: spacing[8] },
  avatar: { width: 72, height: 72, marginTop: spacing[8], borderRadius: 36, backgroundColor: colors.lavender[100], color: colors.plum, fontFamily: fontFamilies.display, fontSize: 36, lineHeight: 72, textAlign: "center", overflow: "hidden" }, mark: { marginTop: spacing[8], color: colors.surface, fontFamily: fontFamilies.display, fontSize: 34 },
  title: { marginTop: spacing[6], maxWidth: 360, color: colors.surface, fontFamily: fontFamilies.display, fontSize: 31, lineHeight: 37, textAlign: "center" }, muted: { marginTop: spacing[3], maxWidth: 320, color: colors.lavender[100], fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 22, textAlign: "center" },
  primary: { width: "100%", minHeight: 50, alignItems: "center", justifyContent: "center", marginTop: spacing[8], borderRadius: radii.control, backgroundColor: colors.surface, paddingHorizontal: spacing[5] }, primaryText: { color: colors.plum, fontFamily: fontFamilies.bodySemiBold, fontSize: 14 }, signup: { width: "100%", minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: spacing[3], borderWidth: 1, borderColor: colors.lavender[500], borderRadius: radii.control }, signupText: { color: colors.surface, fontFamily: fontFamilies.bodyMedium, fontSize: 14 }, secondary: { minHeight: 48, justifyContent: "center", marginTop: spacing[6], paddingHorizontal: spacing[4] }, secondaryText: { color: colors.lavender[100], fontFamily: fontFamilies.bodyMedium, fontSize: 14, textDecorationLine: "underline" }, disabled: { opacity: 0.6 }, error: { marginTop: spacing[5], color: colors.roseDust, fontFamily: fontFamilies.bodyMedium, fontSize: 13, lineHeight: 20, textAlign: "center" },
});

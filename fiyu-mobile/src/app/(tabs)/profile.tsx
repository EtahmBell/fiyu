import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { colors, fontFamilies, radii, spacing } from "@/design";

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  return <View style={styles.root}><Text style={styles.eyebrow}>YOUR FIYU</Text><Text style={styles.title}>Profile</Text><Text style={styles.email}>{session?.email || "Signed in"}</Text><Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.button}><Text style={styles.buttonText}>Sign out</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", padding: spacing[6], backgroundColor: colors.canvas },
  eyebrow: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 11, letterSpacing: 1.8 },
  title: { marginTop: spacing[3], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 40 },
  email: { marginTop: spacing[3], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 15 },
  button: { alignSelf: "flex-start", marginTop: spacing[6], borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radii.control, paddingHorizontal: spacing[5], paddingVertical: spacing[3] },
  buttonText: { color: colors.ink, fontFamily: fontFamilies.bodyMedium, fontSize: 14 },
});

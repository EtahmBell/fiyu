import { StyleSheet, Text, View } from "react-native";

import { colors, fontFamilies, spacing } from "@/design";

export function PlaceholderScreen({ title, note }: { title: string; note: string }) {
  return (
    <View style={styles.root}>
      <Text style={styles.eyebrow}>FIYU NATIVE</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", padding: spacing[6], backgroundColor: colors.canvas },
  eyebrow: {
    color: colors.lavender[700],
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.8,
  },
  title: { marginTop: spacing[3], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 40 },
  note: {
    marginTop: spacing[4],
    maxWidth: 360,
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    fontSize: 15,
    lineHeight: 23,
  },
});

import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors, fontFamilies, spacing } from "@/design";

export function BootstrapScreen({ message = "Opening Fiyu…" }: { message?: string }) {
  return (
    <View style={styles.root} accessibilityRole="progressbar">
      <Text style={styles.brand}>Fiyu</Text>
      <ActivityIndicator color={colors.lavender[600]} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[4],
    backgroundColor: colors.canvas,
  },
  brand: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 40 },
  message: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 14 },
});

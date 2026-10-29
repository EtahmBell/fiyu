import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fontFamilies, spacing } from "@/design";

export function PicksHeader({ onOpenMenu }: { onOpenMenu(): void }) {
  return (
    <View style={styles.header}>
      <View style={styles.identity}>
        <Text style={styles.wordmark}>Fiyu</Text>
        <View style={styles.divider} />
        <Text style={styles.city}>TOKYO</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Notifications unavailable in this preview"
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          disabled
          style={styles.iconButton}
        >
          <Ionicons color={colors.ink} name="notifications-outline" size={21} />
        </Pressable>
        <Pressable accessibilityLabel="Open settings" accessibilityRole="button" onPress={onOpenMenu} style={styles.iconButton}>
          <Ionicons color={colors.ink} name="menu-outline" size={25} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.canvas,
    paddingHorizontal: spacing[5],
  },
  identity: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  wordmark: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 24 },
  divider: { width: 1, height: 20, backgroundColor: colors.line },
  city: { color: colors.inkMuted, fontFamily: fontFamilies.bodySemiBold, fontSize: 10, letterSpacing: 1.4 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing[1] },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});

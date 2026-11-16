import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fontFamilies, spacing } from "@/design";

export function AppHeader({ onOpenMenu }: { onOpenMenu(): void }) {
  return (
    <View style={styles.header}>
      <View style={styles.identity}>
        <Text style={styles.wordmark}>Fiyu</Text>
        <View accessibilityLabel="Current Fiyu city: Tokyo" style={styles.city}>
          <Text style={styles.cityName}>Tokyo</Text>
          <Ionicons color={colors.lavender[700]} name="location-outline" size={16} />
          <Ionicons color={colors.inkMuted} name="chevron-down" size={12} />
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Notifications unavailable in this preview"
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          disabled
          style={styles.iconButton}
        >
          <Ionicons color={colors.inkMuted} name="notifications-outline" size={21} />
        </Pressable>
        <Pressable accessibilityLabel="Open settings" accessibilityRole="button" onPress={onOpenMenu} style={styles.iconButton}>
          <Ionicons color={colors.inkMuted} name="menu-outline" size={24} />
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
  identity: { minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing[1] },
  wordmark: { marginRight: spacing[1], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 23, lineHeight: 28 },
  city: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing[1], paddingHorizontal: spacing[2] },
  cityName: { color: colors.inkMuted, fontFamily: fontFamilies.bodyMedium, fontSize: 14 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing[1] },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
});

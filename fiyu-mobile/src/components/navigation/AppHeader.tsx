import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { colors, fontFamilies, radii, spacing } from "@/design";

export const FIYU_EDITIONS = [
  { id: "tokyo", city: "Tokyo", country: "Japan", status: "available" },
  { id: "new-york", city: "New York", country: "United States", status: "coming-soon" },
  { id: "rome", city: "Rome", country: "Italy", status: "coming-soon" },
] as const;

export function AppHeader({ onOpenMenu }: { onOpenMenu(): void }) {
  const [editionsOpen, setEditionsOpen] = useState(false);
  const { width, height } = useWindowDimensions();
  const activeEdition = FIYU_EDITIONS[0];

  return (
    <View style={styles.header}>
      {editionsOpen ? <Pressable accessibilityLabel="Dismiss edition selector" onPress={() => setEditionsOpen(false)} style={[styles.dismissLayer, { width, height }]} /> : null}
      <View style={styles.identity}>
        <Text style={styles.wordmark}>Fiyu</Text>
        <View accessibilityElementsHidden style={styles.editionDivider} />
        <Pressable
          accessibilityLabel={`Choose Fiyu city edition. Current city: ${activeEdition.city}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: editionsOpen }}
          onPress={() => setEditionsOpen((open) => !open)}
          style={styles.cityButton}
        >
          <Text style={styles.cityName}>{activeEdition.city}</Text>
          <Ionicons color={colors.inkMuted} name="chevron-down" size={12} style={editionsOpen ? styles.chevronOpen : undefined} />
        </Pressable>
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityLabel="Notifications unavailable in this preview" accessibilityRole="button" accessibilityState={{ disabled: true }} disabled style={styles.iconButton}>
          <Ionicons color={colors.inkMuted} name="notifications-outline" size={21} />
        </Pressable>
        <Pressable accessibilityLabel="Open settings" accessibilityRole="button" onPress={() => { setEditionsOpen(false); onOpenMenu(); }} style={styles.iconButton}>
          <Ionicons color={colors.inkMuted} name="menu-outline" size={24} />
        </Pressable>
      </View>

      {editionsOpen ? (
        <View accessibilityLabel="Fiyu editions" style={[styles.editionsMenu, { width: Math.min(300, width - spacing[10]) }]}>
          <Text style={styles.editionsLabel}>Fiyu editions</Text>
          {FIYU_EDITIONS.map((edition) => {
            const available = edition.status === "available";
            return (
              <Pressable
                key={edition.id}
                accessibilityLabel={`${edition.city}, ${edition.country}, ${available ? "Available" : "Coming soon"}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: !available, selected: edition.id === activeEdition.id }}
                disabled={!available}
                onPress={() => setEditionsOpen(false)}
                style={({ pressed }) => [styles.editionRow, pressed && available && styles.editionRowPressed]}
              >
                <View style={styles.editionIdentity}>
                  <Text style={[styles.editionCity, !available && styles.editionMuted]}>{edition.city}</Text>
                  <Text style={styles.editionCountry}>{edition.country}</Text>
                </View>
                <Text style={[styles.editionStatus, !available && styles.editionStatusMuted]}>{available ? "Available" : "Coming soon"}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 58, zIndex: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", overflow: "visible", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, backgroundColor: colors.canvas, paddingHorizontal: spacing[5] },
  dismissLayer: { position: "absolute", top: 58, left: 0, zIndex: 1, backgroundColor: "transparent" },
  identity: { zIndex: 3, minWidth: 0, flexDirection: "row", alignItems: "center" },
  wordmark: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 23, lineHeight: 28 },
  editionDivider: { width: StyleSheet.hairlineWidth, height: 18, marginHorizontal: spacing[3], backgroundColor: colors.lineStrong },
  cityButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing[1], paddingRight: spacing[2] },
  cityName: { color: colors.inkMuted, fontFamily: fontFamilies.bodyMedium, fontSize: 14 },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  actions: { zIndex: 3, flexDirection: "row", alignItems: "center", gap: spacing[1] },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  editionsMenu: { position: "absolute", zIndex: 4, top: 52, left: spacing[5], overflow: "hidden", borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface, padding: spacing[2], shadowColor: colors.plum, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 18, elevation: 8 },
  editionsLabel: { paddingHorizontal: spacing[3], paddingTop: spacing[2], paddingBottom: spacing[1], color: colors.inkFaint, fontFamily: fontFamilies.bodySemiBold, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase" },
  editionRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing[3], borderRadius: radii.control, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  editionRowPressed: { backgroundColor: colors.subtle },
  editionIdentity: { minWidth: 0, flex: 1, flexDirection: "row", alignItems: "baseline", gap: spacing[2] },
  editionCity: { color: colors.ink, fontFamily: fontFamilies.bodyMedium, fontSize: 14 },
  editionCountry: { flexShrink: 1, color: colors.inkFaint, fontFamily: fontFamilies.body, fontSize: 11 },
  editionMuted: { color: colors.inkMuted },
  editionStatus: { color: colors.lavender[700], fontFamily: fontFamilies.bodyMedium, fontSize: 11 },
  editionStatusMuted: { color: colors.inkFaint, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" },
});

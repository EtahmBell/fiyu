import type { SavedRestaurantSummary } from "@fiyu/contracts";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ScoreMark } from "@/components/restaurant/ScoreMark";
import { colors, fontFamilies, radii, spacing } from "@/design";

export function restaurantTitle(restaurant: SavedRestaurantSummary): string {
  return restaurant.name_ja?.trim() || restaurant.name_en?.trim() || "Unnamed restaurant";
}

export function AccountRestaurantRow({ restaurant, detail, onOpen, onRemove, removePending = false }: { restaurant: SavedRestaurantSummary; detail?: string | null; onOpen(): void; onRemove?: () => void; removePending?: boolean }) {
  const title = restaurantTitle(restaurant);
  const english = restaurant.name_en?.trim();
  const subtitle = english && english !== title ? english : null;
  const metadata = [restaurant.display_area || restaurant.neighborhood, restaurant.primary_category].filter(Boolean).join(" · ");
  return <View style={styles.card} accessibilityLabel={`${title}${detail ? `, ${detail}` : ""}`}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${title}`} onPress={onOpen} style={styles.open}>
      <View style={styles.identity}><Text numberOfLines={2} style={styles.title}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text> : null}{metadata ? <Text numberOfLines={1} style={styles.metadata}>{metadata}</Text> : null}{detail ? <Text numberOfLines={2} style={styles.detail}>{detail}</Text> : null}</View>
      <ScoreMark score={restaurant.fiyu_score} />
    </Pressable>
    {onRemove ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${title} from Saved`} disabled={removePending} onPress={onRemove} hitSlop={8} style={styles.remove}><Ionicons name="bookmark" size={19} color={colors.lavender[700]} /><Text style={styles.removeText}>{removePending ? "Removing…" : "Saved"}</Text></Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({ card: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface, padding: spacing[4] }, open: { minHeight: 84, flexDirection: "row", alignItems: "flex-start", gap: spacing[4] }, identity: { flex: 1, minWidth: 0 }, title: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 21, lineHeight: 24 }, subtitle: { marginTop: spacing[1], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 12 }, metadata: { marginTop: spacing[2], color: colors.inkFaint, fontFamily: fontFamilies.bodyMedium, fontSize: 11 }, detail: { marginTop: spacing[2], color: colors.inkBody, fontFamily: fontFamilies.body, fontSize: 12, lineHeight: 18 }, remove: { minHeight: 44, marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.line, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: spacing[2] }, removeText: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 12 } });

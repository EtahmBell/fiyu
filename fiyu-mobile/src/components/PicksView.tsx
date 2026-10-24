import type { ParsedRestaurantList, PublicRestaurant } from "@fiyu/contracts";
import { FiyuApiError } from "@fiyu/contracts";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fontFamilies, radii, spacing } from "@/design";
import { formatFiyuScore, restaurantArea, restaurantName, restaurantSecondaryName } from "@/lib/presentation";

export interface PicksViewProps {
  data?: ParsedRestaurantList;
  isLoading: boolean;
  error: unknown;
  onRetry(): void;
  onOpenRestaurant(placeId: string): void;
}

function errorCopy(error: unknown): { title: string; detail: string } {
  if (error instanceof FiyuApiError && error.kind === "invalid-response") {
    return { title: "Fiyu received restaurant data it could not read.", detail: "Nothing unsafe was displayed. Try again after the service is updated." };
  }
  if (error instanceof FiyuApiError && error.kind === "unauthorized") {
    return { title: "Your session needs attention.", detail: "Sign in again, then retry Picks." };
  }
  return { title: "Picks could not connect.", detail: "Check your connection and try loading Tokyo restaurants again." };
}

function RestaurantRow({ restaurant, onPress }: { restaurant: PublicRestaurant; onPress(): void }) {
  const secondary = restaurantSecondaryName(restaurant);
  const area = restaurantArea(restaurant);
  const metadata = [restaurant.category, area].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${restaurantName(restaurant)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      testID={`restaurant-${restaurant.place_id}`}
    >
      <View style={styles.cardCopy}>
        <Text style={styles.restaurantName}>{restaurantName(restaurant)}</Text>
        {secondary ? <Text style={styles.secondaryName}>{secondary}</Text> : null}
        {metadata ? <Text style={styles.metadata}>{metadata}</Text> : null}
      </View>
      <View style={styles.scoreBlock}>
        <Text style={styles.scoreLabel}>FIYU SCORE</Text>
        <Text style={styles.score}>{formatFiyuScore(restaurant.fiyu_score)}</Text>
        <View style={styles.scoreRule} />
      </View>
    </Pressable>
  );
}

export function PicksView({ data, isLoading, error, onRetry, onOpenRestaurant }: PicksViewProps) {
  if (isLoading) {
    return <View style={styles.center} accessibilityRole="progressbar"><ActivityIndicator color={colors.lavender[600]} /><Text style={styles.statusText}>Finding Tokyo restaurants…</Text></View>;
  }
  if (error) {
    const copy = errorCopy(error);
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>{copy.title}</Text><Text style={styles.statusText}>{copy.detail}</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable>
      </View>
    );
  }
  if (!data || data.restaurants.length === 0) {
    return <View style={styles.center}><Text style={styles.errorTitle}>No Picks are available yet.</Text><Text style={styles.statusText}>Fiyu will show Tokyo restaurants here when the catalog is ready.</Text></View>;
  }
  return (
    <FlatList
      data={data.restaurants}
      keyExtractor={(restaurant) => restaurant.place_id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => <RestaurantRow restaurant={item} onPress={() => onOpenRestaurant(item.place_id)} />}
      ListHeaderComponent={<View style={styles.header}><Text style={styles.eyebrow}>TOKYO EDITION</Text><Text style={styles.heading}>Picks</Text><Text style={styles.intro}>A live, read-only view of Fiyu&apos;s published restaurant catalog.</Text>{data.rejected.length > 0 ? <Text accessibilityRole="alert" style={styles.warning}>{data.rejected.length} malformed {data.rejected.length === 1 ? "restaurant was" : "restaurants were"} omitted.</Text> : null}</View>}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing[4], padding: spacing[6], backgroundColor: colors.canvas },
  statusText: { maxWidth: 320, color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 15, lineHeight: 23, textAlign: "center" },
  errorTitle: { maxWidth: 340, color: colors.ink, fontFamily: fontFamilies.display, fontSize: 28, lineHeight: 34, textAlign: "center" },
  retryButton: { marginTop: spacing[2], borderRadius: radii.control, backgroundColor: colors.plum, paddingHorizontal: 24, paddingVertical: 14 },
  retryText: { color: colors.surface, fontFamily: fontFamilies.bodySemiBold, fontSize: 14 },
  list: { paddingHorizontal: spacing[5], paddingTop: spacing[6], paddingBottom: spacing[10], gap: spacing[3], backgroundColor: colors.canvas },
  header: { marginBottom: spacing[4] },
  eyebrow: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 11, letterSpacing: 1.8 },
  heading: { marginTop: spacing[2], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 46, lineHeight: 50 },
  intro: { marginTop: spacing[3], maxWidth: 420, color: colors.inkBody, fontFamily: fontFamilies.body, fontSize: 15, lineHeight: 23 },
  warning: { marginTop: spacing[4], color: colors.roseDust, fontFamily: fontFamilies.bodyMedium, fontSize: 13 },
  card: { flexDirection: "row", alignItems: "center", gap: spacing[4], minHeight: 108, borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface, padding: spacing[4] },
  cardPressed: { backgroundColor: colors.lavender[50], transform: [{ scale: 0.995 }] },
  cardCopy: { flex: 1, minWidth: 0 },
  restaurantName: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 23, lineHeight: 28 },
  secondaryName: { marginTop: 2, color: colors.inkBody, fontFamily: fontFamilies.bodyMedium, fontSize: 13 },
  metadata: { marginTop: spacing[2], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 12, lineHeight: 18 },
  scoreBlock: { alignItems: "flex-end", minWidth: 62 },
  scoreLabel: { color: colors.lavender[800], fontFamily: fontFamilies.bodySemiBold, fontSize: 8, letterSpacing: 1 },
  score: { marginTop: 3, color: colors.ink, fontFamily: fontFamilies.display, fontSize: 29, lineHeight: 32 },
  scoreRule: { marginTop: 4, width: 24, height: 2, backgroundColor: colors.lavender[500] },
});

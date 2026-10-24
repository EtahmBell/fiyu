import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FiyuApiError } from "@fiyu/contracts";

import { useRestaurant } from "@/api/queries";
import { colors, fontFamilies, spacing } from "@/design";
import { formatFiyuScore, restaurantArea, restaurantName, restaurantSecondaryName } from "@/lib/presentation";

export default function RestaurantDetailScreen() {
  const params = useLocalSearchParams<{ placeId?: string | string[] }>();
  const placeId = Array.isArray(params.placeId) ? params.placeId[0] : params.placeId ?? "";
  const query = useRestaurant(placeId);
  const restaurant = query.data;
  const secondary = restaurant ? restaurantSecondaryName(restaurant) : null;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>‹ Back to Picks</Text>
      </Pressable>
      {query.isLoading ? <View style={styles.state}><ActivityIndicator color={colors.lavender[600]} /><Text style={styles.stateText}>Opening restaurant…</Text></View> : null}
      {query.error ? (
        <View style={styles.state}>
          <Text style={styles.errorTitle}>{query.error instanceof FiyuApiError && query.error.kind === "invalid-response" ? "Restaurant data could not be read." : "Restaurant could not be loaded."}</Text>
          <Pressable accessibilityRole="button" onPress={() => void query.refetch()}><Text style={styles.retry}>Try again</Text></Pressable>
        </View>
      ) : null}
      {restaurant ? (
        <View style={styles.detail}>
          <View style={styles.headingRow}>
            <View style={styles.identity}>
              <Text style={styles.name}>{restaurantName(restaurant)}</Text>
              {secondary ? <Text style={styles.secondary}>{secondary}</Text> : null}
              <Text style={styles.metadata}>{[restaurant.category, restaurantArea(restaurant)].filter(Boolean).join(" · ")}</Text>
            </View>
            <View style={styles.scoreBlock}>
              <Text style={styles.scoreLabel}>FIYU SCORE</Text>
              <Text style={styles.score}>{formatFiyuScore(restaurant.fiyu_score)}<Text style={styles.outOf}>/10</Text></Text>
              <View style={styles.rule} />
            </View>
          </View>
          {restaurant.description_en ? <Text style={styles.description}>{restaurant.description_en}</Text> : null}
          <Text style={styles.proof}>Native route proof · {placeId}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { flexGrow: 1, padding: spacing[5], paddingTop: spacing[6] },
  back: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
  backText: { color: colors.lavender[700], fontFamily: fontFamilies.bodyMedium, fontSize: 14 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing[4], paddingVertical: 80 },
  stateText: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 14 },
  errorTitle: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 28, textAlign: "center" },
  retry: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 14 },
  detail: { marginTop: spacing[6] },
  headingRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[5] },
  identity: { flex: 1 },
  name: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 38, lineHeight: 43 },
  secondary: { marginTop: spacing[2], color: colors.inkBody, fontFamily: fontFamilies.bodyMedium, fontSize: 15 },
  metadata: { marginTop: spacing[3], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 13, lineHeight: 20 },
  scoreBlock: { alignItems: "flex-end", minWidth: 78, paddingTop: 5 },
  scoreLabel: { color: colors.lavender[800], fontFamily: fontFamilies.bodySemiBold, fontSize: 9, letterSpacing: 1.1 },
  score: { marginTop: spacing[1], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 34 },
  outOf: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 12 },
  rule: { width: 28, height: 2, backgroundColor: colors.lavender[500] },
  description: { marginTop: spacing[8], color: colors.inkBody, fontFamily: fontFamilies.body, fontSize: 16, lineHeight: 27 },
  proof: { marginTop: spacing[10], color: colors.inkFaint, fontFamily: fontFamilies.body, fontSize: 11 },
});

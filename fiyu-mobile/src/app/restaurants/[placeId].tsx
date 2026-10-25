import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useRestaurant } from "@/api/queries";
import { RestaurantDetailView } from "@/components/restaurant-detail/RestaurantDetailView";
import { useRestaurantRelationships } from "@/components/restaurant/useRestaurantRelationships";
import { VisitModal } from "@/components/picks/VisitModal";
import { colors, fontFamilies, spacing } from "@/design";
import { restaurantName } from "@/lib/presentation";
import { restaurantDetailErrorCopy } from "@/lib/restaurantDetail";

function LoadState({ title, body, retry, back }: { title: string; body: string; retry?: () => void; back(): void }) {
  return (
    <SafeAreaView style={styles.page}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>
      <View style={styles.state}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        {retry ? <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable> : null}
      </View>
    </SafeAreaView>
  );
}

export default function RestaurantDetailScreen() {
  const params = useLocalSearchParams<{ placeId?: string | string[] }>();
  const router = useRouter();
  const placeId = Array.isArray(params.placeId) ? params.placeId[0] : params.placeId ?? "";
  const query = useRestaurant(placeId);
  const relationships = useRestaurantRelationships();
  const [visitOpen, setVisitOpen] = useState(false);
  const restaurant = query.data;
  const back = () => router.canGoBack() ? router.back() : router.replace("/(tabs)/picks");

  if (!placeId) return <LoadState title="Restaurant not found" body="This restaurant link is incomplete." back={back} />;
  if (query.isLoading && !restaurant) {
    return <SafeAreaView style={styles.page}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable><View style={styles.state}><ActivityIndicator color={colors.lavender[600]} /><View style={styles.skeletonWide} /><View style={styles.skeletonNarrow} /><Text style={styles.loading}>Opening restaurant…</Text></View></SafeAreaView>;
  }
  if (query.error && !restaurant) {
    const copy = restaurantDetailErrorCopy(query.error);
    return <LoadState title={copy.title} body={copy.body} retry={copy.retryable ? () => void query.refetch() : undefined} back={back} />;
  }
  if (!restaurant) return null;

  const saved = relationships.savedIds.has(placeId);
  const visited = relationships.visitsByPlace.has(placeId);
  return (
    <>
      <RestaurantDetailView
        restaurant={restaurant}
        saved={saved}
        visited={visited}
        savePending={relationships.savePendingPlaceId === placeId}
        visitPending={relationships.visitPendingPlaceId === placeId}
        refreshing={query.isPlaceholderData || query.isFetching}
        actionError={relationships.saveError ?? relationships.visitError}
        onBack={back}
        onSave={() => relationships.toggleSaved(placeId)}
        onLog={() => setVisitOpen(true)}
      />
      <VisitModal
        name={visitOpen ? restaurantName(restaurant) : null}
        pending={relationships.visitPendingPlaceId === placeId}
        error={relationships.visitError}
        onClose={() => { if (!relationships.visitPendingPlaceId) setVisitOpen(false); }}
        onSubmit={(rating, note) => relationships.logVisit(placeId, rating, note, () => setVisitOpen(false))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: spacing[5] },
  back: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
  backText: { color: colors.lavender[700], fontFamily: fontFamilies.bodyMedium, fontSize: 14 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 80 },
  title: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 29, textAlign: "center" },
  body: { maxWidth: 300, marginTop: spacing[3], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 22, textAlign: "center" },
  retry: { minHeight: 46, justifyContent: "center", marginTop: spacing[5], paddingHorizontal: spacing[4] },
  retryText: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 14 },
  loading: { marginTop: spacing[4], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 13 },
  skeletonWide: { width: "78%", height: 22, marginTop: spacing[6], borderRadius: 8, backgroundColor: colors.lavender[100] },
  skeletonNarrow: { width: "48%", height: 14, marginTop: spacing[3], borderRadius: 7, backgroundColor: colors.lavender[100] },
});

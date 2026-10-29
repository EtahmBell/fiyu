import type { GooglePhoto, PublicRestaurant } from "@fiyu/contracts";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { fetchPhotoPreview } from "@/api/client";
import { ScoreMark } from "@/components/restaurant/ScoreMark";
import { colors, fontFamilies, radii, spacing } from "@/design";
import { budgetLabel } from "@/lib/picks";
import { restaurantDirectionsUrl } from "@/lib/outbound";
import { restaurantArea, restaurantName, restaurantSecondaryName } from "@/lib/presentation";

export function ConcealedPickCard({ index, personalized = false }: { index: number; personalized?: boolean }) {
  const accent = personalized ? "#C79A32" : colors.lavender[600];
  return (
    <View style={[styles.concealed, personalized && styles.personalizedConcealed]} testID={`concealed-pick-${index}`}>
      <View style={[styles.concealedRule, { backgroundColor: accent }]} />
      <View style={styles.concealedDots}><View style={[styles.concealedDot, { backgroundColor: accent }]} /><View style={[styles.concealedDot, { backgroundColor: accent }]} /><View style={[styles.concealedDot, { backgroundColor: accent }]} /></View>
      <Text style={styles.concealedWordmark}>Fiyu</Text>
      <Text style={[styles.revealAction, { color: accent }]}>{personalized ? "Choose →" : "Reveal →"}</Text>
    </View>
  );
}

function PhotoPreview({ restaurant, enabled }: { restaurant: PublicRestaurant; enabled: boolean }) {
  const query = useQuery({
    queryKey: ["photo-preview", restaurant.place_id],
    queryFn: () => fetchPhotoPreview(restaurant.place_id),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return <PhotoDisplay restaurant={restaurant} photo={query.data} loading={query.isLoading} compact />;
}

export function PhotoDisplay({ restaurant, photo, loading = false, compact = false }: { restaurant: PublicRestaurant; photo?: GooglePhoto; loading?: boolean; compact?: boolean }) {
  if (loading) return <View style={[styles.photoFallback, compact && styles.compactPhoto]}><ActivityIndicator color={colors.lavender[600]} /><Text style={styles.photoCopy}>Loading photo…</Text></View>;
  if (!photo) return <View style={[styles.photoFallback, compact && styles.compactPhoto]}><Text style={styles.photoFallbackMark}>F</Text><Text style={styles.photoCopy}>Photo unavailable</Text></View>;
  const attribution = photo.author_attributions.map((author) => author.display_name).filter(Boolean).join(", ");
  return (
    <View>
      <Image source={{ uri: photo.media_url }} style={[styles.photo, compact && styles.compactPhoto]} contentFit="cover" transition={180} accessibilityLabel={`Photo of ${restaurantName(restaurant)}`} />
      {attribution ? <Text style={styles.attribution}>Photo: {attribution}</Text> : null}
    </View>
  );
}

export interface RevealedPickCardProps {
  restaurant: PublicRestaurant;
  saved: boolean;
  visited: boolean;
  savePending?: boolean;
  visitPending?: boolean;
  tone?: "current" | "recent" | "personalized" | "together";
  photoEnabled?: boolean;
  showLog?: boolean;
  onOpen(): void;
  onSave(): void;
  onLog(): void;
}

export function RevealedPickCard({ restaurant, saved, visited, savePending, visitPending, tone = "current", photoEnabled = true, showLog = true, onOpen, onSave, onLog }: RevealedPickCardProps) {
  const name = restaurantName(restaurant);
  const secondary = restaurantSecondaryName(restaurant);
  const metadata = [restaurant.category, restaurantArea(restaurant)].filter(Boolean).join(" · ");
  const accent = tone === "personalized" ? "#C79A32" : tone === "recent" ? "#7D90B8" : tone === "together" ? colors.plum : colors.lavender[500];
  const description = restaurant.card_description ?? restaurant.description_en;
  const googleMapsUrl = restaurantDirectionsUrl(restaurant, "android");
  const appleMapsUrl = restaurantDirectionsUrl(restaurant, "ios");
  return (
    <View style={styles.card} testID={`revealed-pick-${restaurant.place_id}`}>
      <View style={[styles.topRule, { backgroundColor: accent }]} />
      <View style={styles.header}>
        <View style={styles.titleBlock}><Text style={styles.name}>{name}</Text>{secondary ? <Text style={styles.secondary}>{secondary}</Text> : null}</View>
        <ScoreMark score={restaurant.fiyu_score} accentColor={accent} />
      </View>
      <View style={styles.body}>
        <View style={styles.photoColumn}><PhotoPreview restaurant={restaurant} enabled={photoEnabled} /></View>
        <View style={styles.copyColumn}>
          {metadata ? <Text style={styles.metadata}>{metadata}</Text> : null}
          {description ? <Text numberOfLines={4} style={styles.description}>{description}</Text> : null}
          {budgetLabel(restaurant) ? <Text style={styles.budget}>{budgetLabel(restaurant)}</Text> : null}
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${name}`} onPress={onOpen} style={styles.primaryAction}><Text style={styles.primaryActionText}>View restaurant →</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: saved, disabled: savePending }} disabled={savePending} onPress={onSave} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>{saved ? "Saved" : "Save"}</Text></Pressable>
        {showLog ? <Pressable accessibilityRole="button" accessibilityState={{ selected: visited, disabled: visitPending || visited }} disabled={visitPending || visited} onPress={onLog} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>{visited ? "Visited" : "Log"}</Text></Pressable> : null}
      </View>
      {googleMapsUrl || appleMapsUrl ? <View style={styles.mapActions}>
        {googleMapsUrl ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(googleMapsUrl).catch(() => undefined)}><Text style={styles.mapActionText}>Google Maps ↗</Text></Pressable> : null}
        {appleMapsUrl ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(appleMapsUrl).catch(() => undefined)}><Text style={styles.mapActionText}>Apple Maps ↗</Text></Pressable> : null}
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  concealed: { minHeight: 268, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.lavender[50], padding: spacing[6] },
  personalizedConcealed: { backgroundColor: "#FBF7ED", borderColor: "#E5D4AE" },
  concealedRule: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  concealedDots: { position: "absolute", top: spacing[4], left: spacing[4], flexDirection: "row", gap: 5 },
  concealedDot: { width: 4, height: 4, borderRadius: 2 },
  concealedWordmark: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 34 },
  revealAction: { position: "absolute", right: spacing[4], bottom: spacing[4], fontFamily: fontFamilies.bodySemiBold, fontSize: 13 },
  card: { overflow: "hidden", borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface, padding: spacing[4] },
  topRule: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  header: { flexDirection: "row", gap: spacing[3], paddingTop: spacing[2] },
  titleBlock: { flex: 1 },
  name: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 27, lineHeight: 32 },
  secondary: { marginTop: 2, color: colors.inkMuted, fontFamily: fontFamilies.bodyMedium, fontSize: 12 },
  metadata: { marginTop: spacing[2], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 12 },
  photo: { width: "100%", height: 176, marginTop: spacing[4], borderRadius: 10, backgroundColor: colors.subtle },
  photoFallback: { height: 176, marginTop: spacing[4], alignItems: "center", justifyContent: "center", gap: spacing[2], borderRadius: 10, backgroundColor: colors.subtle },
  photoFallbackMark: { color: colors.lavender[600], fontFamily: fontFamilies.display, fontSize: 34 },
  photoCopy: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 12 },
  attribution: { marginTop: 4, color: colors.inkFaint, fontFamily: fontFamilies.body, fontSize: 9, textAlign: "right" },
  compactPhoto: { width: 96, height: 96, marginTop: 0 },
  body: { flexDirection: "row", gap: spacing[3], marginTop: spacing[3] },
  photoColumn: { width: 96 },
  copyColumn: { flex: 1 },
  description: { marginTop: spacing[2], color: colors.inkBody, fontFamily: fontFamilies.body, fontSize: 13, lineHeight: 19 },
  budget: { marginTop: spacing[3], color: colors.inkBody, fontFamily: fontFamilies.bodyMedium, fontSize: 13 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing[2], marginTop: spacing[4], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.line },
  primaryAction: { flex: 1, minHeight: 44, justifyContent: "center" },
  primaryActionText: { color: colors.plum, fontFamily: fontFamilies.bodySemiBold, fontSize: 14 },
  secondaryAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing[2] },
  secondaryActionText: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 13 },
  mapActions: { flexDirection: "row", gap: spacing[4], paddingTop: spacing[2] },
  mapActionText: { color: colors.inkMuted, fontFamily: fontFamilies.bodyMedium, fontSize: 11 },
});

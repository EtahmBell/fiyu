import type { GooglePhoto, PublicRestaurant } from "@fiyu/contracts";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { fetchPhotoPreview } from "@/api/client";
import { ScoreMark } from "@/components/restaurant/ScoreMark";
import { colors, fontFamilies, radii, spacing } from "@/design";
import { budgetLabel } from "@/lib/picks";
import { restaurantArea, restaurantName, restaurantSecondaryName } from "@/lib/presentation";

export function ConcealedPickCard({ index, personalized = false }: { index: number; personalized?: boolean }) {
  const accent = personalized ? "#C79A32" : colors.lavender[600];
  return (
    <View style={[styles.concealed, personalized && styles.personalizedConcealed]} testID={`concealed-pick-${index}`}>
      <View style={[styles.concealedRule, { backgroundColor: accent }]} />
      <Text style={[styles.concealedEyebrow, { color: accent }]}>{personalized ? "PERSONALIZED PICK" : `FIYU PICK ${index + 1}`}</Text>
      <Text style={styles.concealedTitle}>{personalized ? "Choose this card" : "A place worth knowing"}</Text>
      <Text style={styles.concealedCopy}>{personalized ? "The restaurant stays hidden until you choose." : "Press to reveal today’s restaurant."}</Text>
      <Text style={[styles.revealAction, { color: accent }]}>Reveal →</Text>
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
  return <PhotoDisplay restaurant={restaurant} photo={query.data} loading={query.isLoading} />;
}

export function PhotoDisplay({ restaurant, photo, loading = false }: { restaurant: PublicRestaurant; photo?: GooglePhoto; loading?: boolean }) {
  if (loading) return <View style={styles.photoFallback}><ActivityIndicator color={colors.lavender[600]} /><Text style={styles.photoCopy}>Loading photo…</Text></View>;
  if (!photo) return <View style={styles.photoFallback}><Text style={styles.photoFallbackMark}>F</Text><Text style={styles.photoCopy}>Photo unavailable</Text></View>;
  const attribution = photo.author_attributions.map((author) => author.display_name).filter(Boolean).join(", ");
  return (
    <View>
      <Image source={{ uri: photo.media_url }} style={styles.photo} contentFit="cover" transition={180} accessibilityLabel={`Photo of ${restaurantName(restaurant)}`} />
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
  tone?: "current" | "recent" | "personalized";
  photoEnabled?: boolean;
  onOpen(): void;
  onSave(): void;
  onLog(): void;
}

export function RevealedPickCard({ restaurant, saved, visited, savePending, visitPending, tone = "current", photoEnabled = true, onOpen, onSave, onLog }: RevealedPickCardProps) {
  const name = restaurantName(restaurant);
  const secondary = restaurantSecondaryName(restaurant);
  const metadata = [restaurant.category, restaurantArea(restaurant)].filter(Boolean).join(" · ");
  const accent = tone === "personalized" ? "#C79A32" : tone === "recent" ? "#7D90B8" : colors.lavender[500];
  const description = restaurant.card_description ?? restaurant.description_en;
  return (
    <View style={styles.card} testID={`revealed-pick-${restaurant.place_id}`}>
      <View style={[styles.topRule, { backgroundColor: accent }]} />
      <View style={styles.header}>
        <View style={styles.titleBlock}><Text style={styles.name}>{name}</Text>{secondary ? <Text style={styles.secondary}>{secondary}</Text> : null}</View>
        <ScoreMark score={restaurant.fiyu_score} accentColor={accent} />
      </View>
      {metadata ? <Text style={styles.metadata}>{metadata}</Text> : null}
      <PhotoPreview restaurant={restaurant} enabled={photoEnabled} />
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {budgetLabel(restaurant) ? <Text style={styles.budget}>{budgetLabel(restaurant)}</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${name}`} onPress={onOpen} style={styles.primaryAction}><Text style={styles.primaryActionText}>View restaurant →</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: saved, disabled: savePending }} disabled={savePending} onPress={onSave} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>{saved ? "Saved" : "Save"}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: visited, disabled: visitPending || visited }} disabled={visitPending || visited} onPress={onLog} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>{visited ? "Visited" : "Log"}</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  concealed: { minHeight: 390, overflow: "hidden", justifyContent: "center", borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.lavender[50], padding: spacing[6] },
  personalizedConcealed: { backgroundColor: "#FBF7ED", borderColor: "#E5D4AE" },
  concealedRule: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  concealedEyebrow: { fontFamily: fontFamilies.bodySemiBold, fontSize: 10, letterSpacing: 1.8 },
  concealedTitle: { marginTop: spacing[4], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 30, lineHeight: 35 },
  concealedCopy: { marginTop: spacing[3], maxWidth: 270, color: colors.inkBody, fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 22 },
  revealAction: { marginTop: spacing[6], fontFamily: fontFamilies.bodySemiBold, fontSize: 14 },
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
  description: { marginTop: spacing[4], color: colors.inkBody, fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 22 },
  budget: { marginTop: spacing[3], color: colors.inkBody, fontFamily: fontFamilies.bodyMedium, fontSize: 13 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing[2], marginTop: spacing[4], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.line },
  primaryAction: { flex: 1, minHeight: 44, justifyContent: "center" },
  primaryActionText: { color: colors.plum, fontFamily: fontFamilies.bodySemiBold, fontSize: 14 },
  secondaryAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing[2] },
  secondaryActionText: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 13 },
});

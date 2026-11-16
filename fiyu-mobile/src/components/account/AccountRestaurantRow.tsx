import type { SavedRestaurantSummary } from "@fiyu/contracts";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { fetchPhotoPreview } from "@/api/client";
import { ScoreMark } from "@/components/restaurant/ScoreMark";
import { colors, fontFamilies, radii, spacing } from "@/design";

export function restaurantTitle(restaurant: SavedRestaurantSummary): string {
  return restaurant.name_ja?.trim() || restaurant.name_en?.trim() || "Unnamed restaurant";
}

function RestaurantThumbnail({ placeId, name, enabled }: { placeId: string; name: string; enabled: boolean }) {
  const [failed, setFailed] = useState(false);
  const query = useQuery({
    queryKey: ["photo-preview", placeId],
    queryFn: () => fetchPhotoPreview(placeId),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const photo = query.data;
  const attribution = photo?.author_attributions.map((author) => author.display_name).filter(Boolean).join(", ") ?? "";

  return (
    <View style={styles.photoColumn}>
      {query.isLoading ? (
        <View accessibilityLabel={`Loading photo of ${name}`} style={styles.photoFallback}>
          <ActivityIndicator color={colors.lavender[600]} size="small" />
        </View>
      ) : photo && !failed ? (
        <Image accessibilityLabel={`Photo of ${name}`} contentFit="cover" onError={() => setFailed(true)} source={{ uri: photo.media_url }} style={styles.photo} transition={180} />
      ) : (
        <View accessibilityLabel={`Photo unavailable for ${name}`} style={styles.photoFallback}>
          <Text style={styles.photoMark}>F</Text>
        </View>
      )}
      {attribution && !failed ? <Text numberOfLines={1} style={styles.attribution}>Photo: {attribution}</Text> : null}
    </View>
  );
}

export function AccountRestaurantRow({ restaurant, detail, onOpen, onRemove, removePending = false, photoEnabled = true }: { restaurant: SavedRestaurantSummary; detail?: string | null; onOpen?: () => void; onRemove?: () => void; removePending?: boolean; photoEnabled?: boolean }) {
  const title = restaurantTitle(restaurant);
  const english = restaurant.name_en?.trim();
  const subtitle = english && english !== title ? english : null;
  const metadata = [restaurant.primary_category, restaurant.display_area || restaurant.neighborhood].filter(Boolean).join(" · ");
  const content = <View style={styles.layout}>
    <RestaurantThumbnail enabled={photoEnabled} name={title} placeId={restaurant.place_id} />
    <View style={styles.copy}>
      <View style={styles.topRow}>
        <View style={styles.identity}><Text numberOfLines={2} style={styles.title}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text> : null}</View>
        <View style={styles.trailing}>
          <ScoreMark score={restaurant.fiyu_score} />
          {onRemove ? <Pressable accessibilityLabel={`Remove ${title} from Saved`} accessibilityRole="button" accessibilityState={{ selected: true, disabled: removePending }} disabled={removePending} hitSlop={6} onPress={onRemove} style={styles.bookmark}><Ionicons color={colors.lavender[700]} name="bookmark" size={20} /></Pressable> : null}
        </View>
      </View>
      {metadata ? <Text numberOfLines={1} style={styles.metadata}>{metadata}</Text> : null}
      {detail ? <Text numberOfLines={1} style={styles.detail}>{detail}</Text> : null}
      {onOpen ? <Pressable accessibilityLabel={`Open ${title}`} accessibilityRole="button" onPress={onOpen} style={styles.viewButton}><Text style={styles.viewAction}>View restaurant <Text style={styles.arrow}>→</Text></Text></Pressable> : null}
    </View>
  </View>;
  return <View accessibilityLabel={`${title}${detail ? `, ${detail}` : ""}`} style={styles.card}><View style={styles.open}>{content}</View></View>;
}

const styles = StyleSheet.create({
  card: { overflow: "hidden", borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, backgroundColor: colors.surface, padding: spacing[3] },
  open: { minWidth: 0 },
  layout: { minWidth: 0, flexDirection: "row", alignItems: "stretch", gap: 10 },
  photoColumn: { width: 108, flexShrink: 0 },
  photo: { width: 108, height: 96, borderRadius: 10, backgroundColor: colors.subtle },
  photoFallback: { width: 108, height: 96, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.lavender[50] },
  photoMark: { color: colors.lavender[600], fontFamily: fontFamilies.display, fontSize: 29 },
  attribution: { marginTop: 3, color: colors.inkFaint, fontFamily: fontFamilies.body, fontSize: 8, lineHeight: 10 },
  copy: { minWidth: 0, flex: 1 },
  topRow: { minWidth: 0, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing[2] },
  identity: { minWidth: 0, flex: 1, paddingTop: 1 },
  title: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 18, lineHeight: 20 },
  subtitle: { marginTop: 2, color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 11, lineHeight: 15 },
  trailing: { flexDirection: "row", alignItems: "flex-start", gap: 1 },
  bookmark: { width: 32, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radii.control },
  metadata: { marginTop: spacing[1], color: colors.inkFaint, fontFamily: fontFamilies.body, fontSize: 10.5, lineHeight: 15 },
  detail: { marginTop: 2, color: colors.inkBody, fontFamily: fontFamilies.body, fontSize: 10.5, lineHeight: 15 },
  viewButton: { minHeight: 28, marginTop: "auto", justifyContent: "flex-end" },
  viewAction: { color: colors.plum, fontFamily: fontFamilies.bodySemiBold, fontSize: 12, lineHeight: 20 },
  arrow: { color: colors.lavender[600] },
});

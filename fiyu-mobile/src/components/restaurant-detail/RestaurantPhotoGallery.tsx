import type { GooglePhoto } from "@fiyu/contracts";
import { Image } from "expo-image";
import { useState } from "react";
import { FlatList, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { useRestaurantPhotos } from "@/api/queries";
import { colors, fontFamilies, radii, spacing } from "@/design";

function Placeholder({ failed = false }: { failed?: boolean }) {
  return (
    <View style={styles.placeholder} accessibilityLabel={failed ? "Restaurant photos unavailable" : "Loading restaurant photos"}>
      <Text style={styles.placeholderMark}>Fiyu</Text>
      <View style={styles.placeholderRule} />
      <Text style={styles.placeholderCopy}>{failed ? "Photos unavailable right now" : "Loading restaurant photos"}</Text>
    </View>
  );
}

function Attribution({ photo }: { photo: GooglePhoto }) {
  const authors = photo.author_attributions.filter((author) => author.display_name);
  const reportUri = photo.flag_content_uri ?? photo.author_attributions.find((author) => author.flag_content_uri)?.flag_content_uri ?? null;
  if (!authors.length && !photo.google_maps_uri && !reportUri) return null;
  return (
    <View style={styles.attributionRow}>
      {authors.map((author, index) => author.uri ? (
        <Pressable key={`${author.display_name}:${index}`} accessibilityRole="link" onPress={() => void Linking.openURL(author.uri!)}>
          <Text style={styles.attributionLink}>{index === 0 ? "Photo by " : ""}{author.display_name}</Text>
        </Pressable>
      ) : <Text key={`${author.display_name}:${index}`} style={styles.attribution}>{index === 0 ? "Photo by " : ""}{author.display_name}</Text>)}
      {photo.google_maps_uri ? (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(photo.google_maps_uri!)}>
          <Text style={styles.attributionLink}>Source on Google Maps</Text>
        </Pressable>
      ) : null}
      {reportUri ? (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(reportUri)}>
          <Text style={styles.attributionLink}>Report photo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function RestaurantPhotoGallery({ placeId, restaurantName }: { placeId: string; restaurantName: string }) {
  const query = useRestaurantPhotos(placeId);
  const [activeIndex, setActiveIndex] = useState(0);
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set());
  const { width } = useWindowDimensions();
  const galleryWidth = Math.max(240, width - spacing[5] * 2);
  const photos = query.data ?? [];
  const activePhoto = photos[activeIndex] ?? photos[0];

  if (query.isLoading) return <Placeholder />;
  if (query.isError || photos.length === 0 || failed.size >= photos.length) return <Placeholder failed />;

  return (
    <View accessibilityRole="summary" accessibilityLabel={`Photo gallery for ${restaurantName}`}>
      <View style={[styles.frame, { width: galleryWidth, height: galleryWidth * 0.75 }]}>
        <FlatList
          accessibilityLabel="Restaurant photo gallery"
          data={photos}
          horizontal
          pagingEnabled
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
          removeClippedSubviews
          showsHorizontalScrollIndicator={false}
          keyExtractor={(photo, index) => `${photo.media_url}:${index}`}
          getItemLayout={(_, index) => ({ length: galleryWidth, offset: galleryWidth * index, index })}
          onMomentumScrollEnd={(event) => {
            const next = Math.round(event.nativeEvent.contentOffset.x / galleryWidth);
            setActiveIndex(Math.max(0, Math.min(photos.length - 1, next)));
          }}
          renderItem={({ item, index }) => failed.has(index) ? (
            <View style={{ width: galleryWidth }}><Placeholder failed /></View>
          ) : (
            <Image
              source={{ uri: item.media_url }}
              style={{ width: galleryWidth, height: galleryWidth * 0.75 }}
              contentFit="cover"
              transition={180}
              accessibilityLabel={`${restaurantName}, photo ${index + 1} from Google`}
              onError={() => setFailed((current) => new Set([...current, index]))}
            />
          )}
        />
        {photos.length > 1 ? (
          <View style={styles.indicators} accessible accessibilityLabel={`Photo ${activeIndex + 1} of ${photos.length}`}>
            {photos.map((photo, index) => <View key={photo.media_url} style={[styles.indicator, index === activeIndex && styles.indicatorActive]} />)}
          </View>
        ) : null}
      </View>
      {activePhoto ? <Attribution photo={activePhoto} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", borderRadius: radii.card, backgroundColor: colors.lavender[50] },
  placeholder: { width: "100%", minHeight: 260, flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.lavender[50] },
  placeholderMark: { color: colors.lavender[700], opacity: 0.55, fontFamily: fontFamilies.display, fontSize: 31 },
  placeholderRule: { width: 40, height: 1, marginTop: spacing[2], backgroundColor: colors.lavender[500], opacity: 0.45 },
  placeholderCopy: { marginTop: spacing[3], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 12 },
  indicators: { position: "absolute", left: spacing[5], right: spacing[5], bottom: spacing[3], flexDirection: "row", justifyContent: "center", gap: 6, borderRadius: radii.pill, backgroundColor: "rgba(49,40,61,0.24)", padding: spacing[2] },
  indicator: { width: 24, height: 4, borderRadius: radii.pill, backgroundColor: "rgba(234,231,248,0.65)" },
  indicatorActive: { backgroundColor: colors.canvas },
  attributionRow: { minHeight: 32, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing[2], paddingTop: spacing[2] },
  attribution: { color: colors.inkFaint, fontFamily: fontFamilies.body, fontSize: 10 },
  attributionLink: { color: colors.lavender[700], fontFamily: fontFamilies.bodyMedium, fontSize: 10, textDecorationLine: "underline" },
});

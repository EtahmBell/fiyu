import type { PublicRestaurantDetail } from "@fiyu/contracts";
import { useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScoreMark } from "@/components/restaurant/ScoreMark";
import { colors, fontFamilies, radii, spacing } from "@/design";
import { budgetLabelPerPerson } from "@/lib/picks";
import { restaurantDirectionsUrl, restaurantShareUrl } from "@/lib/outbound";
import { restaurantArea, restaurantName, restaurantSecondaryName } from "@/lib/presentation";
import { RestaurantPhotoGallery } from "./RestaurantPhotoGallery";

interface RestaurantDetailViewProps {
  restaurant: PublicRestaurantDetail;
  saved: boolean;
  visited: boolean;
  savePending?: boolean;
  visitPending?: boolean;
  refreshing?: boolean;
  actionError?: string | null;
  onBack(): void;
  onSave(): void;
  onLog(): void;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function formatReservation(value: string | null | undefined): string | null {
  const labels: Record<string, string> = {
    required: "Reservation required",
    strongly_recommended: "Reservation strongly recommended",
    recommended: "Reservation recommended",
    walk_ins_ok: "Walk-ins welcome",
    usually_not_needed: "Reservations usually not needed",
  };
  return value ? labels[value] ?? null : null;
}

function practicalFacts(restaurant: PublicRestaurantDetail): { label: string; value: string }[] {
  const info = restaurant.practical_info;
  const groups: { label: string; values: (string | null | false | undefined)[] }[] = [
    { label: "Seating", values: [info?.seating?.counter && "Counter seating", info?.seating?.tables && "Table seating", info?.seating?.private_rooms && "Private rooms", info?.seating?.small_capacity && "Small capacity"] },
    { label: "Good for", values: [info?.visit_style?.solo_friendly && "Solo-friendly", info?.visit_style?.group_friendly && "Good for groups", info?.visit_style?.date_friendly && "Good for dates"] },
    { label: "Payment", values: [info?.payment?.cash_only && "Cash only", info?.payment?.cards && "Cards accepted", info?.payment?.electronic_payment && "Electronic payment accepted"] },
    { label: "Service", values: [info?.service_periods?.lunch && "Lunch", info?.service_periods?.dinner && "Dinner", info?.service_periods?.late_night && "Late night"] },
    { label: "Other", values: info?.other ?? [] },
  ];
  return groups.flatMap((group) => {
    const values = group.values.filter((value): value is string => typeof value === "string" && value.length > 0);
    return values.length ? [{ label: group.label, value: values.join(" · ") }] : [];
  });
}

function hoursRows(restaurant: PublicRestaurantDetail): { day: string; value: string }[] {
  const hours = restaurant.opening_hours;
  if (!hours) return [];
  return DAYS.flatMap((day) => {
    const record = hours[day];
    if (!record) return [];
    const periods = (record.periods ?? []).map((period) => period.label ?? [period.open, period.close].filter(Boolean).join("–")).filter(Boolean);
    const value = periods.join(", ") || record.status;
    return value ? [{ day: `${day[0].toUpperCase()}${day.slice(1, 3)}`, value }] : [];
  });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionAccent} />
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ScoreTransparency({ restaurant }: { restaurant: PublicRestaurantDetail }) {
  const [expanded, setExpanded] = useState(false);
  const explanation = restaurant.score_transparency;
  return (
    <Section title="Why Fiyu found it">
      <Text style={styles.body}>{explanation?.reasons.length ? explanation.reasons.join(" ") : "Detailed discovery evidence is not available for this restaurant."}</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.disclosure}>
        <Text style={styles.disclosureText}>Signals behind the score</Text><Text style={styles.disclosureText}>{expanded ? "−" : "+"}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.breakdown}>
          <Text style={styles.smallBody}>{explanation?.model_label ?? "Scoring details unavailable"}. These are stored model signals on a 0–10 scale, not separate ratings.</Text>
          {explanation?.signals.map((signal) => (
            <View key={signal.key} style={styles.signal}>
              <View style={styles.signalHeading}><Text style={styles.signalLabel}>{signal.label}</Text><Text style={styles.signalValue}>{signal.value.toFixed(1)} / 10</Text></View>
              <Text style={styles.smallBody}>{signal.description}</Text>
            </View>
          ))}
          {explanation?.evidence_confidence ? <Text style={styles.smallBody}>Research confidence: {explanation.evidence_confidence}. This describes evidence coverage, not verified food quality.</Text> : null}
        </View>
      ) : null}
    </Section>
  );
}

export function RestaurantDetailView({ restaurant, saved, visited, savePending, visitPending, refreshing, actionError, onBack, onSave, onLog }: RestaurantDetailViewProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const name = restaurantName(restaurant);
  const secondary = restaurantSecondaryName(restaurant);
  const area = restaurantArea(restaurant);
  const budget = budgetLabelPerPerson(restaurant);
  const cuisine = [restaurant.category, ...restaurant.cuisine_terms_en].filter((value): value is string => Boolean(value?.trim())).filter((value, index, values) => values.indexOf(value) === index).slice(0, 2).join(" · ");
  const description = restaurant.card_description ?? restaurant.description_en;
  const themes = (restaurant.review_themes ?? []).map((theme) => theme.theme.trim()).filter(Boolean).slice(0, 4);
  const reservation = formatReservation(restaurant.reservation_status) ?? (restaurant.opening_hours?.reservation_only ? "Reservation required" : formatReservation(restaurant.practical_info?.reservation?.status));
  const facts = practicalFacts(restaurant);
  const hours = hoursRows(restaurant);
  const directionsUrl = restaurantDirectionsUrl(restaurant, Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web");
  const share = async () => {
    setLocalError(null);
    try {
      await Share.share({ title: `${name} on Fiyu`, message: `Thought you might like ${name} on Fiyu.\n${restaurantShareUrl(restaurant.place_id)}`, url: restaurantShareUrl(restaurant.place_id) });
    } catch { setLocalError("This restaurant could not be shared right now."); }
  };
  const directions = async () => {
    if (!directionsUrl) return;
    setLocalError(null);
    try { await Linking.openURL(directionsUrl); } catch { setLocalError("Directions could not be opened right now."); }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable>
        {refreshing ? <Text accessibilityRole="text" style={styles.refreshing}>Refreshing restaurant details…</Text> : null}
        <RestaurantPhotoGallery placeId={restaurant.place_id} restaurantName={name} />

        <View style={styles.headingRow}>
          <View style={styles.identity}>
            <Text accessibilityRole="header" style={[styles.name, restaurant.name_ja && styles.japaneseName]}>{name}</Text>
            {secondary ? <Text style={styles.secondary}>{secondary}</Text> : null}
          </View>
          <ScoreMark score={restaurant.fiyu_score} large />
        </View>

        <View style={styles.summaryGrid}>
          {area ? <SummaryFact label="Area" value={area} /> : null}
          {cuisine ? <SummaryFact label="Cuisine" value={cuisine} /> : null}
          {budget ? <SummaryFact label="Budget" value={budget} /> : null}
        </View>
        {restaurant.food_tags.length ? <View style={styles.chips}>{restaurant.food_tags.map((tag) => <View key={tag} style={styles.chip}><Text style={styles.chipText}>{tag}</Text></View>)}</View> : null}

        <View style={styles.actions}>
          <Action label={saved ? "Saved" : "Save"} selected={saved} disabled={savePending} onPress={onSave} />
          <Action label={visited ? "Visited" : "Log visit"} selected={visited} disabled={visitPending || visited} onPress={onLog} />
          {directionsUrl ? <Action label="Directions" onPress={() => void directions()} /> : null}
          <Action label="Share" onPress={() => void share()} />
        </View>
        {actionError || localError ? <Text accessibilityRole="alert" style={styles.error}>{actionError ?? localError}</Text> : null}

        {description || themes.length ? <Section title="Overview">{description ? <Text style={styles.body}>{description}</Text> : null}{themes.map((theme) => <Text key={theme} style={styles.bullet}>•  {theme}</Text>)}</Section> : null}
        <ScoreTransparency restaurant={restaurant} />

        {budget || reservation || facts.length || restaurant.phone_number ? (
          <Section title="Practical info">
            {budget ? <InfoRow label="Budget" value={budget} /> : null}
            {reservation ? <InfoRow label="Reservations" value={reservation} /> : null}
            {facts.map((fact) => <InfoRow key={fact.label} label={fact.label} value={fact.value} />)}
            {restaurant.phone_number ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`tel:${restaurant.phone_number}`)}><InfoRow label="Phone" value={restaurant.phone_number} link /></Pressable> : null}
          </Section>
        ) : null}

        {hours.length || restaurant.opening_hours?.schedule_note ? (
          <Section title="Hours">
            {hours.map((row) => <InfoRow key={row.day} label={row.day} value={row.value} />)}
            {restaurant.opening_hours?.schedule_note ? <Text style={styles.smallBody}>{restaurant.opening_hours.schedule_note}</Text> : null}
          </Section>
        ) : null}

        {restaurant.signature_dishes_en.length ? <Section title="Signature dishes">{restaurant.signature_dishes_en.map((dish) => <Text key={dish} style={styles.bullet}>•  {dish}</Text>)}</Section> : null}

        {restaurant.verified_core_address || restaurant.location_label ? (
          <Section title="Location">
            {restaurant.verified_core_address ? <Text style={styles.body}>{restaurant.verified_core_address}</Text> : null}
            {restaurant.map_location_approximate ? <Text style={styles.approximate}>{restaurant.location_label ?? "Approximate area"}</Text> : null}
            {directionsUrl ? <Pressable accessibilityRole="link" onPress={() => void directions()} style={styles.locationAction}><Text style={styles.linkText}>Open directions →</Text></Pressable> : null}
          </Section>
        ) : null}
        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryFact({ label, value }: { label: string; value: string }) { return <View style={styles.summaryFact}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>; }
function InfoRow({ label, value, link = false }: { label: string; value: string; link?: boolean }) { return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={[styles.infoValue, link && styles.linkText]}>{value}</Text></View>; }
function Action({ label, selected = false, disabled = false, onPress }: { label: string; selected?: boolean; disabled?: boolean; onPress(): void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, selected && styles.actionSelected, pressed && styles.actionPressed]}><Text style={[styles.actionText, selected && styles.actionTextSelected]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing[5], paddingTop: spacing[2] },
  back: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginBottom: spacing[3] },
  backText: { color: colors.lavender[700], fontFamily: fontFamilies.bodyMedium, fontSize: 14 },
  refreshing: { marginBottom: spacing[2], color: colors.inkFaint, fontFamily: fontFamilies.body, fontSize: 11 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[5], marginTop: spacing[6] },
  identity: { flex: 1 },
  name: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 36, lineHeight: 41 },
  japaneseName: { fontFamily: fontFamilies.japaneseMedium, fontSize: 30, lineHeight: 40 },
  secondary: { marginTop: spacing[2], color: colors.inkMuted, fontFamily: fontFamilies.bodyMedium, fontSize: 15 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing[4], marginTop: spacing[5], borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: spacing[3] },
  summaryFact: { minWidth: "28%", flex: 1 },
  summaryLabel: { color: colors.inkMuted, fontFamily: fontFamilies.bodySemiBold, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" },
  summaryValue: { marginTop: 2, color: colors.inkBody, fontFamily: fontFamilies.body, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2], marginTop: spacing[3] },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: radii.pill, backgroundColor: colors.subtle, paddingHorizontal: spacing[3], paddingVertical: 6 },
  chipText: { color: colors.inkMuted, fontFamily: fontFamilies.bodyMedium, fontSize: 11 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2], marginTop: spacing[4] },
  action: { minHeight: 44, justifyContent: "center", borderRadius: radii.control, paddingHorizontal: spacing[3] },
  actionSelected: { backgroundColor: colors.lavender[100] },
  actionPressed: { opacity: 0.65 },
  actionText: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 13 },
  actionTextSelected: { color: colors.lavender[800] },
  error: { marginTop: spacing[2], color: colors.roseDust, fontFamily: fontFamilies.bodyMedium, fontSize: 12 },
  section: { position: "relative", marginTop: spacing[8], borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing[5] },
  sectionAccent: { position: "absolute", top: -1, left: 0, width: 40, height: 2, borderRadius: radii.pill, backgroundColor: colors.lavender[500] },
  sectionTitle: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 25 },
  body: { marginTop: spacing[3], color: colors.inkBody, fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 23 },
  smallBody: { marginTop: spacing[2], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 12, lineHeight: 19 },
  bullet: { marginTop: spacing[2], color: colors.inkBody, fontFamily: fontFamilies.body, fontSize: 13, lineHeight: 21 },
  disclosure: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing[4], borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  disclosureText: { color: colors.plum, fontFamily: fontFamilies.bodySemiBold, fontSize: 13 },
  breakdown: { paddingBottom: spacing[3] },
  signal: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: spacing[3] },
  signalHeading: { flexDirection: "row", justifyContent: "space-between", gap: spacing[3] },
  signalLabel: { flex: 1, color: colors.ink, fontFamily: fontFamilies.bodySemiBold, fontSize: 13 },
  signalValue: { color: colors.ink, fontFamily: fontFamilies.bodyMedium, fontSize: 13 },
  infoRow: { flexDirection: "row", gap: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: spacing[3] },
  infoLabel: { width: 100, color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 13 },
  infoValue: { flex: 1, color: colors.inkBody, fontFamily: fontFamilies.body, fontSize: 13, lineHeight: 20 },
  linkText: { color: colors.lavender[700], textDecorationLine: "underline" },
  approximate: { marginTop: spacing[2], color: colors.roseDust, fontFamily: fontFamilies.bodyMedium, fontSize: 12 },
  locationAction: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", marginTop: spacing[2] },
  bottomSpace: { height: spacing[12] },
});

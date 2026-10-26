import type { MyPick, MyPickPlaceSuggestion, MyPickQuota } from "@fiyu/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { fetchMyPickPlaceSuggestions, submitMyPick } from "@/api/client";
import { picksKeys } from "@/api/queries";
import { colors, fontFamilies, radii, spacing } from "@/design";

function sessionToken(): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export function MyPickComposerContent({ quota, onClose }: { quota: MyPickQuota | null; onClose(): void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [, setToken] = useState(sessionToken);
  const [suggestions, setSuggestions] = useState<MyPickPlaceSuggestion[]>([]);
  const [selection, setSelection] = useState<MyPickPlaceSuggestion | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = useMutation({
    mutationFn: (nextToken: string) => fetchMyPickPlaceSuggestions({ name: name.trim(), address: address.trim(), session_token: nextToken }),
    onSuccess: (items) => { setSuggestions(items); setError(items.length ? null : "We couldn't find a matching restaurant. Check the name or address and try again."); },
    onError: () => setError("We couldn't check restaurants right now. Try again."),
  });
  const submit = useMutation({
    mutationFn: () => {
      if (!selection) throw new Error("Select a restaurant first");
      return submitMyPick({ externalPlaceId: selection.external_place_id, userNameHint: name.trim(), userAddressHint: address.trim() });
    },
    onSuccess: (item) => {
      queryClient.setQueryData<MyPick[]>(picksKeys.myPicks, (current = []) => [item, ...current.filter((entry) => entry.my_pick_id !== item.my_pick_id)]);
      void queryClient.invalidateQueries({ queryKey: picksKeys.myPickQuota });
      setSubmitted(true);
      setError(null);
    },
    onError: () => { setError("My Pick could not be submitted right now. Please try again."); void queryClient.invalidateQueries({ queryKey: picksKeys.myPickQuota }); },
  });
  const exhausted = quota?.remaining === 0;
  const canSearch = name.trim().length > 0 && address.trim().length > 0 && !search.isPending;
  const quotaCopy = useMemo(() => quota ? `${quota.remaining} of ${quota.limit} My Picks remaining` : "Checking availability…", [quota]);
  const edit = (field: "name" | "address", value: string) => {
    if (field === "name") setName(value); else setAddress(value);
    setSelection(null); setSuggestions([]); setError(null);
  };
  const close = () => { if (!submit.isPending) onClose(); };

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.headingRow}><View style={styles.headingCopy}><Text style={styles.eyebrow}>MY PICK</Text><Text style={styles.title}>{submitted ? "Submitted to Fiyu" : "Have somewhere in mind?"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close My Pick" disabled={submit.isPending} onPress={close} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable></View>
        {submitted ? <View style={styles.submitted}><Text style={styles.body}>We’ll look into it and let you know when your Pick is ready.</Text><Pressable accessibilityRole="button" onPress={close} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Done</Text></Pressable></View>
          : exhausted ? <View style={styles.notice}><Text style={styles.noticeTitle}>You’ve used your 3 My Picks for now.</Text><Text style={styles.body}>Another Pick becomes available as the rolling 24-hour window advances.</Text></View>
          : <><Text style={styles.body}>Give Fiyu a restaurant and we’ll score it.</Text><Text style={styles.label}>Restaurant name *</Text><TextInput testID="my-pick-name" accessibilityLabel="Restaurant name" value={name} maxLength={200} autoCorrect={false} returnKeyType="next" onChangeText={(value) => edit("name", value)} style={styles.input} /><Text style={styles.help}>Enter the name as you know it.</Text><Text style={styles.label}>Restaurant address *</Text><TextInput testID="my-pick-address" accessibilityLabel="Restaurant address" value={address} maxLength={500} autoCapitalize="none" returnKeyType="search" onChangeText={(value) => edit("address", value)} onSubmitEditing={() => { if (canSearch) { const nextToken = sessionToken(); setToken(nextToken); search.mutate(nextToken); } }} style={styles.input} /><Text style={styles.help}>Enter or paste the restaurant’s address.</Text><Pressable testID="my-pick-find" accessibilityRole="button" accessibilityLabel="Find restaurant" disabled={!canSearch} onPress={() => { const nextToken = sessionToken(); setToken(nextToken); search.mutate(nextToken); }} style={[styles.primaryButton, !canSearch && styles.disabled]}>{search.isPending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>Find restaurant</Text>}</Pressable>
          {suggestions.length ? <View style={styles.suggestions}>{suggestions.map((item) => <Pressable key={item.external_place_id} accessibilityRole="button" accessibilityState={{ selected: selection?.external_place_id === item.external_place_id }} onPress={() => { setSelection(item); setError(null); }} style={[styles.suggestion, selection?.external_place_id === item.external_place_id && styles.suggestionSelected]}><Text style={styles.suggestionTitle}>{selection?.external_place_id === item.external_place_id ? "✓ " : ""}{item.primary_text}</Text>{item.secondary_text ? <Text style={styles.suggestionSecondary}>{item.secondary_text}</Text> : null}</Pressable>)}<Text accessibilityLabel="Google Maps" style={styles.google}>Google Maps</Text></View> : null}
          <Pressable testID="my-pick-submit" accessibilityRole="button" accessibilityLabel="Submit to Fiyu" disabled={!selection || submit.isPending} onPress={() => submit.mutate()} style={[styles.primaryButton, (!selection || submit.isPending) && styles.disabled]}>{submit.isPending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>Submit to Fiyu →</Text>}</Pressable></>}
        <Text style={styles.quota}>{quotaCopy}</Text>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>;
}

export function MyPickComposer({ visible, quota, onClose }: { visible: boolean; quota: MyPickQuota | null; onClose(): void }) {
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>{visible ? <MyPickComposerContent quota={quota} onClose={onClose} /> : null}</Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas }, content: { paddingHorizontal: spacing[5], paddingTop: spacing[8], paddingBottom: spacing[12] }, headingRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] }, headingCopy: { flex: 1 }, eyebrow: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 10, letterSpacing: 1.8 }, title: { marginTop: spacing[2], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 30, lineHeight: 35 }, close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, closeText: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 30 }, body: { marginTop: spacing[3], color: colors.inkBody, fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 22 }, label: { marginTop: spacing[5], marginBottom: spacing[2], color: colors.ink, fontFamily: fontFamilies.bodyMedium, fontSize: 14 }, input: { minHeight: 50, borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface, paddingHorizontal: spacing[4], color: colors.ink, fontFamily: fontFamilies.body, fontSize: 16 }, help: { marginTop: spacing[2], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 12 }, primaryButton: { minHeight: 48, marginTop: spacing[4], alignItems: "center", justifyContent: "center", borderRadius: radii.control, backgroundColor: colors.plum, paddingHorizontal: spacing[4] }, primaryButtonText: { color: colors.surface, fontFamily: fontFamilies.bodySemiBold, fontSize: 14 }, disabled: { opacity: 0.4 }, suggestions: { marginTop: spacing[3], overflow: "hidden", borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface }, suggestion: { minHeight: 58, justifyContent: "center", paddingHorizontal: spacing[4], paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.line }, suggestionSelected: { backgroundColor: colors.lavender[50] }, suggestionTitle: { color: colors.ink, fontFamily: fontFamilies.bodyMedium, fontSize: 14 }, suggestionSecondary: { marginTop: 3, color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 12 }, google: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 11, textAlign: "right" }, quota: { marginTop: spacing[4], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 12 }, error: { marginTop: spacing[3], color: colors.roseDust, fontFamily: fontFamilies.bodyMedium, fontSize: 13 }, notice: { marginTop: spacing[5], borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.subtle, padding: spacing[4] }, noticeTitle: { color: colors.ink, fontFamily: fontFamilies.bodyMedium, fontSize: 14 }, submitted: { paddingTop: spacing[4] },
});

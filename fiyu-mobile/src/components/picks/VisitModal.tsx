import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors, fontFamilies, radii, spacing } from "@/design";

interface VisitModalProps { name: string | null; pending: boolean; error: string | null; initialRating?: 1 | 2 | 3 | 4 | 5; initialNote?: string | null; submitLabel?: string; onDelete?: () => void; onClose(): void; onSubmit(rating: 1 | 2 | 3 | 4 | 5, note: string | null): void }

export function VisitModal({ name, pending, error, initialRating = 5, initialNote = null, submitLabel = "Save visit", onDelete, onClose, onSubmit }: VisitModalProps) {
  if (name === null) return null;
  return <VisitModalContent key={`${name}:${initialRating}:${initialNote ?? ""}`} name={name} pending={pending} error={error} initialRating={initialRating} initialNote={initialNote} submitLabel={submitLabel} onDelete={onDelete} onClose={onClose} onSubmit={onSubmit} />;
}

function VisitModalContent({ name, pending, error, initialRating = 5, initialNote = null, submitLabel = "Save visit", onDelete, onClose, onSubmit }: Omit<VisitModalProps, "name"> & { name: string }) {
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(initialRating);
  const [note, setNote] = useState(initialNote ?? "");
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}><View style={styles.sheet} accessibilityViewIsModal>
        <Text style={styles.eyebrow}>LOG A VISIT</Text><Text style={styles.title}>{name}</Text>
        <Text style={styles.label}>Your rating</Text>
        <View style={styles.ratings}>{([1, 2, 3, 4, 5] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: rating === value }} onPress={() => setRating(value)} style={[styles.rating, rating === value && styles.ratingSelected]}><Text style={[styles.ratingText, rating === value && styles.ratingTextSelected]}>{value}</Text></Pressable>)}</View>
        <Text style={styles.label}>Private note (optional)</Text><TextInput value={note} onChangeText={setNote} multiline placeholder="What should you remember?" placeholderTextColor={colors.inkFaint} style={styles.input} />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>{onDelete ? <Pressable accessibilityRole="button" accessibilityLabel="Delete visit" onPress={onDelete} disabled={pending} style={[styles.action, styles.delete]}><Text style={styles.deleteText}>Delete</Text></Pressable> : null}<View style={styles.actionSpacer} /><Pressable onPress={onClose} disabled={pending} style={styles.action}><Text style={styles.cancel}>Cancel</Text></Pressable><Pressable onPress={() => onSubmit(rating, note.trim() || null)} disabled={pending} style={[styles.action, styles.submit]}><Text style={styles.submitText}>{pending ? "Saving…" : submitLabel}</Text></Pressable></View>
      </View></KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(25,23,29,0.38)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.canvas, padding: spacing[6], paddingBottom: spacing[10] },
  eyebrow: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold, fontSize: 10, letterSpacing: 1.6 },
  title: { marginTop: spacing[2], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 29 },
  label: { marginTop: spacing[5], marginBottom: spacing[2], color: colors.inkBody, fontFamily: fontFamilies.bodySemiBold, fontSize: 12 },
  ratings: { flexDirection: "row", gap: spacing[2] },
  rating: { flex: 1, minHeight: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radii.control },
  ratingSelected: { borderColor: colors.lavender[600], backgroundColor: colors.lavender[100] },
  ratingText: { color: colors.inkMuted, fontFamily: fontFamilies.bodySemiBold },
  ratingTextSelected: { color: colors.lavender[800] },
  input: { minHeight: 90, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radii.control, backgroundColor: colors.surface, padding: spacing[3], color: colors.ink, fontFamily: fontFamilies.body, textAlignVertical: "top" },
  error: { marginTop: spacing[3], color: colors.roseDust, fontFamily: fontFamilies.bodyMedium },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing[2], marginTop: spacing[5] }, actionSpacer: { flex: 1 },
  action: { minHeight: 46, justifyContent: "center", borderRadius: radii.control, paddingHorizontal: spacing[4] },
  cancel: { color: colors.inkMuted, fontFamily: fontFamilies.bodySemiBold },
  submit: { backgroundColor: colors.plum },
  submitText: { color: colors.surface, fontFamily: fontFamilies.bodySemiBold },
  delete: { borderWidth: 1, borderColor: colors.roseDust }, deleteText: { color: colors.roseDust, fontFamily: fontFamilies.bodySemiBold },
});

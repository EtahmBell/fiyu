import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fontFamilies, radii, spacing } from "@/design";

interface PersonalizedPickModalProps {
  visible: boolean;
  pending: boolean;
  error: string | null;
  onChoose(position: number): void;
  onDismiss(): void;
}

export function PersonalizedPickModal({ visible, pending, error, onChoose, onDismiss }: PersonalizedPickModalProps) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.eyebrow}>PERSONALIZED PICK</Text>
          <Text style={styles.title}>One is waiting for you.</Text>
          <Text style={styles.copy}>Choose by instinct. All three identities stay hidden until your choice is final.</Text>
          <View style={styles.cards}>
            {[0, 1, 2].map((position) => (
              <Pressable
                key={position}
                accessibilityRole="button"
                accessibilityLabel={`Choose hidden Personalized Pick ${position + 1}`}
                disabled={pending}
                onPress={() => onChoose(position)}
                style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}
                testID={`personalized-choice-${position}`}
              >
                <Text style={styles.choiceIndex}>{position + 1}</Text>
                <Text style={styles.choiceText}>Choose</Text>
              </Pressable>
            ))}
          </View>
          {pending ? <ActivityIndicator color="#946F2D" /> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" onPress={onDismiss} disabled={pending} style={styles.dismiss}><Text style={styles.dismissText}>Not now</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(25,23,29,0.38)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.canvas, padding: spacing[6], paddingBottom: spacing[10] },
  eyebrow: { color: "#946F2D", fontFamily: fontFamilies.bodySemiBold, fontSize: 10, letterSpacing: 1.8 },
  title: { marginTop: spacing[2], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 34, lineHeight: 39 },
  copy: { marginTop: spacing[3], color: colors.inkBody, fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 22 },
  cards: { flexDirection: "row", gap: spacing[2], marginVertical: spacing[6] },
  choice: { flex: 1, minHeight: 142, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D8C18E", borderRadius: radii.card, backgroundColor: "#FBF7ED" },
  choicePressed: { transform: [{ scale: 0.985 }], backgroundColor: "#F6EDD9" },
  choiceIndex: { color: "#946F2D", fontFamily: fontFamilies.display, fontSize: 34 },
  choiceText: { marginTop: spacing[2], color: "#77571F", fontFamily: fontFamilies.bodySemiBold, fontSize: 12 },
  dismiss: { alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: spacing[4] },
  dismissText: { color: colors.inkMuted, fontFamily: fontFamilies.bodyMedium, fontSize: 14 },
  error: { marginBottom: spacing[2], color: colors.roseDust, fontFamily: fontFamilies.bodyMedium, textAlign: "center" },
});

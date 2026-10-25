import { StyleSheet, Text, View } from "react-native";

import { colors, fontFamilies, spacing } from "@/design";
import { formatFiyuScore } from "@/lib/presentation";

export function ScoreMark({ score, large = false, accentColor = colors.lavender[500] }: { score: number | null; large?: boolean; accentColor?: string }) {
  const formatted = formatFiyuScore(score);
  return (
    <View accessible accessibilityLabel={`Fiyu score ${formatted} out of 10`} style={[styles.block, large && styles.blockLarge]}>
      <Text style={[styles.label, large && styles.labelLarge]}>FIYU SCORE</Text>
      <Text style={[styles.score, large && styles.scoreLarge]}>
        {formatted}<Text style={[styles.outOf, large && styles.outOfLarge]}>/10</Text>
      </Text>
      <View style={[styles.rule, large && styles.ruleLarge, { backgroundColor: accentColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: "flex-end", minWidth: 63 },
  blockLarge: { minWidth: 78, paddingTop: 5 },
  label: { color: colors.lavender[800], fontFamily: fontFamilies.bodySemiBold, fontSize: 8, letterSpacing: 1 },
  labelLarge: { fontSize: 9, letterSpacing: 1.1 },
  score: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 30, lineHeight: 34 },
  scoreLarge: { marginTop: spacing[1], fontSize: 34, lineHeight: 38 },
  outOf: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 11 },
  outOfLarge: { fontSize: 12 },
  rule: { width: 24, height: 2 },
  ruleLarge: { width: 28 },
});

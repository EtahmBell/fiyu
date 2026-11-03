import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { colors, fontFamilies } from "@/design";
import { bottomTabMetrics } from "@/lib/tabBarMetrics";
import { decorativeSvgAccessibilityProps } from "@/lib/svgAccessibility";

const icons = {
  lists: ["list-outline", "list"],
  log: ["add-circle-outline", "add-circle"],
  map: ["map-outline", "map"],
  profile: ["person-outline", "person"],
} as const;

function PicksTabIcon({ color, size }: { color: string; size: number }) {
  return <Svg {...decorativeSvgAccessibilityProps(Platform.OS)} width={size + 4} height={size} viewBox="0 0 28 24">
    <Path d="M14 2.5 16.5 9 20 12l-3.5 3L14 21.5 11.5 15 8 12l3.5-3L14 2.5ZM4 5.5 5 8l2.5 1L5 10l-1 2.5L3 10 .5 9 3 8l1-2.5Zm20 0L25 8l2.5 1L25 10l-1 2.5L23 10l-2.5-1L23 8l1-2.5Z" fill={color} />
  </Svg>;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const metrics = bottomTabMetrics(insets.bottom);
  return (
    <Tabs screenOptions={{
      headerShown: false,
      sceneStyle: { backgroundColor: colors.canvas },
      tabBarActiveTintColor: colors.lavender[700],
      tabBarInactiveTintColor: colors.inkMuted,
      tabBarStyle: { ...metrics, backgroundColor: colors.canvas, borderTopColor: colors.line },
      tabBarItemStyle: { paddingVertical: 1 },
      tabBarLabelStyle: { marginTop: 2, fontFamily: fontFamilies.bodyMedium, fontSize: 11 },
    }}>
      {(["picks", ...Object.keys(icons)] as ("picks" | keyof typeof icons)[]).map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: name === "picks" ? "Picks" : name.charAt(0).toUpperCase() + name.slice(1),
            tabBarAccessibilityLabel: name === "log" ? "Log a visit" : undefined,
            tabBarButton: name === "log" ? ({ ref: _ref, style, accessibilityState, ...props }) => <Pressable {...props} accessibilityState={accessibilityState} style={({ pressed }) => [style, styles.logTabButton, accessibilityState?.selected && styles.logTabButtonFocused, pressed && styles.logTabButtonPressed]} /> : undefined,
            tabBarIcon: ({ color, focused, size }) => name === "picks"
              ? <PicksTabIcon color={color as string} size={size} />
              : <Ionicons name={name === "log" ? "add" : icons[name][focused ? 1 : 0]} color={color as string} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  logTabButton: { marginHorizontal: 4, marginVertical: 3, borderRadius: 12 },
  logTabButtonFocused: { backgroundColor: colors.lavender[100] },
  logTabButtonPressed: { opacity: 0.8 },
});

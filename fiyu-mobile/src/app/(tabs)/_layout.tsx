import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PicksTabIcon } from "@/components/navigation/PicksTabIcon";
import { colors, fontFamilies } from "@/design";
import { bottomTabMetrics, LOG_TAB_BUTTON_GEOMETRY } from "@/lib/tabBarMetrics";

const icons = {
  lists: ["list-outline", "list"],
  log: ["add-circle-outline", "add-circle"],
  map: ["map-outline", "map"],
  profile: ["person-outline", "person"],
} as const;

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
      tabBarItemStyle: { paddingVertical: 3 },
      tabBarLabelStyle: { marginTop: 3, fontFamily: fontFamilies.bodyMedium, fontSize: 11, lineHeight: 16 },
    }}>
      {(["picks", ...Object.keys(icons)] as ("picks" | keyof typeof icons)[]).map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: name === "picks" ? "Picks" : name.charAt(0).toUpperCase() + name.slice(1),
            tabBarAccessibilityLabel: name === "log" ? "Log a visit" : undefined,
            tabBarButton: name === "log" ? ({ ref: _ref, style, "aria-selected": selected, ...props }) => <Pressable {...props} aria-selected={selected} style={({ pressed }) => [style, styles.logTabButton, selected && styles.logTabButtonFocused, pressed && styles.logTabButtonPressed]} /> : undefined,
            tabBarIcon: ({ color, focused, size }) => name === "picks"
              ? <PicksTabIcon color={color as string} focused={focused} size={size} />
              : <Ionicons name={name === "log" ? "add" : icons[name][focused ? 1 : 0]} color={color as string} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  logTabButton: { ...LOG_TAB_BUTTON_GEOMETRY, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.lavender[50] },
  logTabButtonFocused: { borderColor: colors.lavender[200], backgroundColor: colors.lavender[100] },
  logTabButtonPressed: { opacity: 0.8 },
});

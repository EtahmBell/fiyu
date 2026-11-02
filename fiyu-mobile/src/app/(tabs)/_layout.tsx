import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fontFamilies } from "@/design";
import { bottomTabMetrics } from "@/lib/tabBarMetrics";

const icons = {
  picks: ["sparkles-outline", "sparkles"],
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
      tabBarItemStyle: { paddingVertical: 1 },
      tabBarLabelStyle: { marginTop: 2, fontFamily: fontFamilies.bodyMedium, fontSize: 11 },
    }}>
      {(Object.keys(icons) as (keyof typeof icons)[]).map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: name === "picks" ? "Picks" : name.charAt(0).toUpperCase() + name.slice(1),
            tabBarAccessibilityLabel: name === "log" ? "Log a visit" : undefined,
            tabBarIcon: ({ color, focused, size }) => name === "log" ? (
              <View style={[styles.logIcon, focused && styles.logIconFocused]}>
                <Ionicons name="add" color={color as string} size={size} />
              </View>
            ) : <Ionicons name={icons[name][focused ? 1 : 0]} color={color as string} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  logIcon: { width: 44, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.lavender[50] },
  logIconFocused: { borderColor: colors.lavender[200], backgroundColor: colors.lavender[100] },
});

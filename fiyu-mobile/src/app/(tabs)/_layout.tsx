import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { colors, fontFamilies } from "@/design";

const icons = {
  picks: ["sparkles-outline", "sparkles"],
  lists: ["list-outline", "list"],
  log: ["add-circle-outline", "add-circle"],
  map: ["map-outline", "map"],
  profile: ["person-outline", "person"],
} as const;

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      sceneStyle: { backgroundColor: colors.canvas },
      tabBarActiveTintColor: colors.lavender[700],
      tabBarInactiveTintColor: colors.inkMuted,
      tabBarStyle: { backgroundColor: colors.canvas, borderTopColor: colors.line },
      tabBarLabelStyle: { fontFamily: fontFamilies.bodyMedium, fontSize: 11 },
    }}>
      {(Object.keys(icons) as (keyof typeof icons)[]).map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: name === "picks" ? "Picks" : name.charAt(0).toUpperCase() + name.slice(1),
            tabBarAccessibilityLabel: name === "log" ? "Log a visit" : undefined,
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons name={icons[name][focused ? 1 : 0]} color={color as string} size={size} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

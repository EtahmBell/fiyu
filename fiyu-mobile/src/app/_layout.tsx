import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AuthProvider, protectedRouteGroups, useAuth } from "@/auth/AuthProvider";
import { BootstrapScreen } from "@/components/BootstrapScreen";
import { colors, fontFamilies, spacing, useFiyuFonts } from "@/design";
import { QueryProvider } from "@/providers/QueryProvider";

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { status } = useAuth();
  if (status === "loading") return <BootstrapScreen />;
  const guards = protectedRouteGroups(status);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={guards.auth}><Stack.Screen name="(auth)" /></Stack.Protected>
      <Stack.Protected guard={guards.application}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="restaurants/[placeId]" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFiyuFonts();
  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontError, fontsLoaded]);

  if (fontError) {
    return <View style={styles.fontError}><Text style={styles.fontErrorTitle}>Fiyu typography could not load.</Text><Text style={styles.fontErrorCopy}>{fontError.message}</Text></View>;
  }
  if (!fontsLoaded) return null;
  return (
    <QueryProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </QueryProvider>
  );
}

const styles = StyleSheet.create({
  fontError: { flex: 1, justifyContent: "center", padding: spacing[6], backgroundColor: colors.canvas },
  fontErrorTitle: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 30 },
  fontErrorCopy: { marginTop: spacing[3], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 14 },
});

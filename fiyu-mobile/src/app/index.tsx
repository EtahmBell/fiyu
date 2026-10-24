import { Redirect } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { BootstrapScreen } from "@/components/BootstrapScreen";

export default function IndexScreen() {
  const { status } = useAuth();
  if (status === "loading") return <BootstrapScreen />;
  return <Redirect href={status === "authenticated" ? "/(tabs)/picks" : "/(auth)/sign-in"} />;
}

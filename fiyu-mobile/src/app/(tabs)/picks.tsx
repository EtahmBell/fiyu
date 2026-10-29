import { router, useLocalSearchParams, type Href } from "expo-router";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PicksExperience } from "@/components/picks/PicksExperience";

export default function PicksScreen() {
  const { myPickId } = useLocalSearchParams<{ myPickId?: string }>();
  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <PicksExperience
        initialMyPickId={myPickId}
        onOpenRestaurant={(placeId) => router.push({ pathname: "/restaurants/[placeId]", params: { placeId } })}
        onOpenTogether={() => router.push("/together" as Href)}
        onOpenTogetherSession={(sessionId) => router.push(`/together/session/${encodeURIComponent(sessionId)}` as Href)}
        onOpenMenu={() => router.push("/profile" as Href)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });

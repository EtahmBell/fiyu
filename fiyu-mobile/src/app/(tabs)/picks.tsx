import { router } from "expo-router";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PicksExperience } from "@/components/picks/PicksExperience";

export default function PicksScreen() {
  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <PicksExperience
        onOpenRestaurant={(placeId) => router.push({ pathname: "/restaurants/[placeId]", params: { placeId } })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });

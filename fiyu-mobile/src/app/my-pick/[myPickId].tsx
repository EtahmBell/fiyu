import { Redirect, useLocalSearchParams } from "expo-router";

export default function MyPickDeepLink() {
  const { myPickId } = useLocalSearchParams<{ myPickId: string }>();
  return <Redirect href={{ pathname: "/(tabs)/picks", params: { myPickId } }} />;
}

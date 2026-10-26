import * as Clipboard from "expo-clipboard";
import { Share } from "react-native";

export async function shareTogetherInvite(url: string): Promise<"shared" | "dismissed"> {
  const result = await Share.share({
    title: "Fiyu Together",
    message: `Find three Fiyu Picks with me.\n${url}`,
    url,
  });
  return result.action === Share.dismissedAction ? "dismissed" : "shared";
}

export async function copyTogetherInvite(url: string): Promise<void> {
  await Clipboard.setStringAsync(url);
}

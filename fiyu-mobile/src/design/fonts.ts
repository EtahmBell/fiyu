import { InstrumentSerif_400Regular } from "@expo-google-fonts/instrument-serif/400Regular";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { NotoSansJP_400Regular } from "@expo-google-fonts/noto-sans-jp/400Regular";
import { NotoSansJP_500Medium } from "@expo-google-fonts/noto-sans-jp/500Medium";
import { useFonts } from "expo-font";

export function useFiyuFonts(): [boolean, Error | null] {
  return useFonts({
    InstrumentSerif_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    NotoSansJP_400Regular,
    NotoSansJP_500Medium,
  });
}

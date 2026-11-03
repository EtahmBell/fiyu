import { Platform } from "react-native";
import Svg, { Path } from "react-native-svg";

import { decorativeSvgAccessibilityProps } from "@/lib/svgAccessibility";

export function PicksTabIcon({ color, focused, size }: { color: string; focused: boolean; size: number }) {
  return <Svg
    testID="picks-tab-icon"
    {...decorativeSvgAccessibilityProps(Platform.OS)}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={focused ? color : "none"}
    fillOpacity={focused ? 0.16 : 0}
    stroke={color}
    strokeWidth={focused ? 2 : 1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="m12 2 1.35 4.15L17.5 7.5l-4.15 1.35L12 13l-1.35-4.15L6.5 7.5l4.15-1.35L12 2Z" />
    <Path d="m18.5 13 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    <Path d="m5 14 .65 1.85 1.85.65-1.85.65L5 19l-.65-1.85-1.85-.65 1.85-.65L5 14Z" />
  </Svg>;
}

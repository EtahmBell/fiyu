export type DecorativeSvgAccessibilityProps = {
  "aria-hidden"?: true;
  accessibilityElementsHidden?: true;
  focusable: false;
  importantForAccessibility?: "no-hide-descendants";
};

export function decorativeSvgAccessibilityProps(platform: string): DecorativeSvgAccessibilityProps {
  return platform === "web"
    ? { "aria-hidden": true, focusable: false }
    : { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants", focusable: false };
}

export const LOG_TAB_BUTTON_GEOMETRY = {
  marginHorizontal: 10,
  borderRadius: 12,
  justifyContent: "center",
} as const;

export function bottomTabMetrics(bottomInset: number) {
  const paddingBottom = Math.max(bottomInset, 6);
  return { height: 74 + paddingBottom, paddingTop: 6, paddingBottom } as const;
}

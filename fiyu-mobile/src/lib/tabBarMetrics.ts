export function bottomTabMetrics(bottomInset: number) {
  const paddingBottom = Math.max(bottomInset, 8);
  return { height: 64 + paddingBottom, paddingTop: 7, paddingBottom } as const;
}

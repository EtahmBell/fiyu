import type { PublicRestaurant } from "@/lib/api/schemas";

export function formatRestaurantBudget(
  budget: PublicRestaurant["budget"],
  options: { includePerPerson?: boolean } = {},
): string | null {
  if (!budget) return null;
  const formatter = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: budget.currency,
    maximumFractionDigits: 0,
  });
  const formatAmount = (amount: number) => formatter.format(amount).replace("￥", "¥");
  let value: string | null = null;
  if (budget.minimum !== null && budget.maximum !== null) {
    value = `${formatAmount(budget.minimum)}–${formatAmount(budget.maximum)}`;
  } else if (budget.minimum !== null) {
    value = `${formatAmount(budget.minimum)}+`;
  } else if (budget.maximum !== null) {
    value = `Up to ${formatAmount(budget.maximum)}`;
  }
  return value && options.includePerPerson ? `${value} per person` : value;
}

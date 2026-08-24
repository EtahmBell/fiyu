import type { PublicRestaurantDetail } from "@/lib/api/schemas";

type PracticalInfo = NonNullable<PublicRestaurantDetail["practical_info"]>;
type OpeningHours = NonNullable<PublicRestaurantDetail["opening_hours"]>;

const DAY_LABELS = [
  ["monday", "Monday"],
  ["tuesday", "Tuesday"],
  ["wednesday", "Wednesday"],
  ["thursday", "Thursday"],
  ["friday", "Friday"],
  ["saturday", "Saturday"],
  ["sunday", "Sunday"],
] as const;

const PERIOD_LABELS: Record<string, string> = {
  lunch: "Lunch",
  dinner: "Dinner",
  late_night: "Late night",
};

export function practicalFacts(info: PracticalInfo | undefined): string[] {
  if (!info) return [];

  const facts: string[] = [];
  const reservation = info.reservation?.status;
  if (reservation === "required") facts.push("Reservations required");
  if (reservation === "strongly_recommended") facts.push("Reservations strongly recommended");
  if (reservation === "recommended") facts.push("Reservations recommended");
  if (reservation === "walk_ins_ok") facts.push("Walk-ins welcome");
  if (reservation === "usually_not_needed") facts.push("Reservations usually not needed");

  if (info.seating?.counter === true) facts.push("Counter seating");
  if (info.seating?.tables === true) facts.push("Table seating");
  if (info.seating?.private_rooms === true) facts.push("Private rooms");
  if (info.seating?.small_capacity === true) facts.push("Small capacity");

  if (info.visit_style?.solo_friendly === true) facts.push("Solo-friendly");
  if (info.visit_style?.group_friendly === true) facts.push("Good for groups");
  if (info.visit_style?.date_friendly === true) facts.push("Good for dates");

  if (info.service_periods?.lunch === true) facts.push("Lunch");
  if (info.service_periods?.dinner === true) facts.push("Dinner");
  if (info.service_periods?.late_night === true) facts.push("Late night");

  if (info.payment?.cash_only === true) facts.push("Cash only");
  if (info.payment?.cards === true) facts.push("Cards accepted");
  if (info.payment?.electronic_payment === true) facts.push("Electronic payment accepted");

  for (const fact of info.other ?? []) {
    const trimmed = fact.trim();
    if (trimmed) facts.push(trimmed);
  }
  return [...new Set(facts)];
}

export interface HoursRow {
  day: string;
  value: string;
}

function periodText(period: NonNullable<NonNullable<OpeningHours["monday"]>["periods"]>[number]): string | null {
  if (!period.open || !period.close) return null;
  const label = period.label ? PERIOD_LABELS[period.label] : null;
  const time = `${period.open}–${period.close}`;
  const lastOrder = period.last_order ? `, last order ${period.last_order}` : "";
  return `${label ? `${label} ` : ""}${time}${lastOrder}`;
}

export function knownHours(hours: OpeningHours | undefined): HoursRow[] {
  if (!hours) return [];
  const rows: HoursRow[] = [];

  for (const [key, day] of DAY_LABELS) {
    const schedule = hours[key];
    if (!schedule || schedule.status === "unknown" || !schedule.status) continue;
    if (schedule.status === "closed") {
      rows.push({ day, value: "Closed" });
      continue;
    }

    const periods = (schedule.periods ?? [])
      .map(periodText)
      .filter((value): value is string => value !== null);
    if (schedule.status === "irregular") {
      rows.push({ day, value: periods.length > 0 ? `Irregular · ${periods.join("; ")}` : "Irregular" });
    } else if (periods.length > 0) {
      rows.push({ day, value: periods.join("; ") });
    }
  }
  return rows;
}

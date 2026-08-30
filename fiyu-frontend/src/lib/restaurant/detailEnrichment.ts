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

export interface PracticalPresentation {
  atAGlance: string[];
  bookingNotes: string[];
  beforeYouGo: string[];
}

const RESERVATION_COPY = /\b(reservation|booking)\b/i;
const HOURS_COPY = /\b(closed|opening hours?|service (?:runs|hours?)|lunch|dinner|late[- ]night)\b|\b\d{1,2}:\d{2}\b/i;
const CATEGORICAL_OTHER = /^(?:non[- ]smoking|smoking allowed|standing bar)$/i;
const STRUCTURED_RESERVATION_COPY = /^(?:reservations? (?:are )?(?:required|strongly recommended|recommended|usually not needed)|walk-ins? (?:are )?welcome)\.?$/i;

export function classifyPracticalInfo(info: PracticalInfo | undefined): PracticalPresentation {
  if (!info) return { atAGlance: [], bookingNotes: [], beforeYouGo: [] };

  const atAGlance: string[] = [];
  const bookingNotes: string[] = [];
  const beforeYouGo: string[] = [];

  if (info.seating?.counter === true) atAGlance.push("Counter seating");
  if (info.seating?.tables === true) atAGlance.push("Table seating");
  if (info.seating?.private_rooms === true) atAGlance.push("Private rooms");
  if (info.seating?.small_capacity === true) atAGlance.push("Small capacity");

  if (info.visit_style?.solo_friendly === true) atAGlance.push("Solo-friendly");
  if (info.visit_style?.group_friendly === true) atAGlance.push("Good for groups");
  if (info.visit_style?.date_friendly === true) atAGlance.push("Good for dates");

  if (info.payment?.cash_only === true) atAGlance.push("Cash only");
  if (info.payment?.cards === true) atAGlance.push("Cards accepted");
  if (info.payment?.electronic_payment === true) atAGlance.push("Electronic payment accepted");

  for (const fact of info.other ?? []) {
    const trimmed = fact.trim();
    if (!trimmed) continue;
    if (RESERVATION_COPY.test(trimmed)) {
      if (!STRUCTURED_RESERVATION_COPY.test(trimmed)) bookingNotes.push(trimmed);
    } else if (HOURS_COPY.test(trimmed)) {
      // Structured Hours owns service periods, closures, and clock-time restatements.
      continue;
    } else if (CATEGORICAL_OTHER.test(trimmed)) {
      atAGlance.push(trimmed);
    } else if (!/^(?:cash only|cards accepted|electronic payment accepted)$/i.test(trimmed)) {
      beforeYouGo.push(trimmed);
    }
  }
  return {
    atAGlance: [...new Set(atAGlance)].slice(0, 6),
    bookingNotes: [...new Set(bookingNotes)],
    beforeYouGo: [...new Set(beforeYouGo)],
  };
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

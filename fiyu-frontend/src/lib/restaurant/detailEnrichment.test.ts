import { describe, expect, it } from "vitest";

import { knownHours, practicalFacts } from "@/lib/restaurant/detailEnrichment";

describe("restaurant detail enrichment presentation", () => {
  it("keeps only known practical facts and omits unknown values", () => {
    expect(practicalFacts({
      reservation: { status: "recommended", confidence: 0.82 },
      seating: { counter: true, tables: null, private_rooms: false, small_capacity: true },
      visit_style: { solo_friendly: true, group_friendly: null, date_friendly: false },
      service_periods: { lunch: true, dinner: true, late_night: null },
      payment: { cash_only: false, cards: true, electronic_payment: null },
      other: [],
      confidence: 0.7,
    })).toEqual([
      "Reservations recommended",
      "Counter seating",
      "Small capacity",
      "Solo-friendly",
      "Lunch",
      "Dinner",
      "Cards accepted",
    ]);
  });

  it("formats split service periods, closures, irregular hours, and last order", () => {
    expect(knownHours({
      monday: {
        status: "open",
        periods: [
          { open: "12:00", close: "14:00", label: "lunch", last_order: "13:30" },
          { open: "18:00", close: "22:00", label: "dinner", last_order: "21:30" },
        ],
      },
      tuesday: { status: "closed", periods: [] },
      wednesday: { status: "irregular", periods: [] },
      thursday: { status: "unknown", periods: [] },
    })).toEqual([
      { day: "Monday", value: "Lunch 12:00–14:00, last order 13:30; Dinner 18:00–22:00, last order 21:30" },
      { day: "Tuesday", value: "Closed" },
      { day: "Wednesday", value: "Irregular" },
    ]);
  });

  it("returns no rows for wholly unknown hours", () => {
    expect(knownHours({
      monday: { status: "unknown", periods: [] },
      tuesday: { status: "unknown", periods: [] },
    })).toEqual([]);
  });
});


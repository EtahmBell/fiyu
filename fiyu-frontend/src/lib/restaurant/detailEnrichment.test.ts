import { describe, expect, it } from "vitest";

import { classifyPracticalInfo, knownHours } from "@/lib/restaurant/detailEnrichment";

describe("restaurant detail enrichment presentation", () => {
  it("keeps only known practical facts and omits unknown values", () => {
    expect(classifyPracticalInfo({
      reservation: { status: "recommended", confidence: 0.82 },
      seating: { counter: true, tables: null, private_rooms: false, small_capacity: true },
      visit_style: { solo_friendly: true, group_friendly: null, date_friendly: false },
      service_periods: { lunch: true, dinner: true, late_night: null },
      payment: { cash_only: false, cards: true, electronic_payment: null },
      other: [],
      confidence: 0.7,
    })).toEqual({
      atAGlance: ["Counter seating", "Small capacity", "Solo-friendly", "Cards accepted"],
      bookingNotes: [],
      beforeYouGo: [],
    });
  });

  it("classifies free-text facts by semantic owner and drops structured duplication", () => {
    expect(classifyPracticalInfo({
      reservation: { status: "required" },
      seating: { counter: true, private_rooms: true },
      payment: { cards: true },
      other: [
        "Reservation required.",
        "Reservation phone hours are 13:00–17:00.",
        "The restaurant is closed on Wednesdays.",
        "Six-seat counter and private room for up to six guests.",
        "Non-smoking",
      ],
    })).toEqual({
      atAGlance: ["Counter seating", "Private rooms", "Cards accepted", "Non-smoking"],
      bookingNotes: ["Reservation phone hours are 13:00–17:00."],
      beforeYouGo: ["Six-seat counter and private room for up to six guests."],
    });
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
      { day: "Mon", value: "Lunch 12:00–14:00, last order 13:30; Dinner 18:00–22:00, last order 21:30" },
      { day: "Tue", value: "Closed" },
      { day: "Wed", value: "Irregular" },
    ]);
  });

  it("groups adjacent days only when their known schedules are identical", () => {
    expect(knownHours({
      monday: { status: "open", periods: [{ open: "18:00", close: "23:00", label: "dinner" }] },
      tuesday: { status: "open", periods: [{ open: "18:00", close: "23:00", label: "dinner" }] },
      wednesday: { status: "unknown", periods: [] },
      thursday: { status: "open", periods: [{ open: "18:00", close: "23:00", label: "dinner" }] },
      friday: { status: "closed", periods: [] },
      saturday: { status: "closed", periods: [] },
      sunday: { status: "closed", periods: [] },
    })).toEqual([
      { day: "Mon–Tue", value: "Dinner 18:00–23:00" },
      { day: "Thu", value: "Dinner 18:00–23:00" },
      { day: "Fri–Sun", value: "Closed" },
    ]);
  });

  it("returns no rows for wholly unknown hours", () => {
    expect(knownHours({
      monday: { status: "unknown", periods: [] },
      tuesday: { status: "unknown", periods: [] },
    })).toEqual([]);
  });
});

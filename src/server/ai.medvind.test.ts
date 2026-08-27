import { describe, expect, it } from "vitest";

import { mergeMedvindWorkEvents } from "@/server/ai";

function event(
  startsAt: string,
  endsAt: string,
  code: "Ar" | "Bo" | "Ob" | "An",
  overrides: Partial<Parameters<typeof mergeMedvindWorkEvents>[0][number]> = {},
) {
  return {
    title: code === "An" ? "Jobb (annat arbete)" : "Jobb",
    category: "work" as const,
    startsAt,
    endsAt,
    allDay: false,
    location: null,
    notes: null,
    confidence: 0.99,
    sourceExcerpt: `${startsAt.slice(11, 16)}-${endsAt.slice(11, 16)} ${code}`,
    ...overrides,
  };
}

describe("mergeMedvindWorkEvents", () => {
  it("merges overlapping Ar and Bo rows into one work shift with its calendar note", () => {
    const events = mergeMedvindWorkEvents([
      event("2026-08-21T07:00:00+02:00", "2026-08-21T14:00:00+02:00", "Ar"),
      event("2026-08-21T14:00:00+02:00", "2026-08-21T16:00:00+02:00", "Bo", {
        location: "Hemv Södra",
        notes: "Hemv Södra, Södra",
      }),
      event("2026-08-21T14:00:00+02:00", "2026-08-21T16:00:00+02:00", "Ar"),
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Jobb",
      startsAt: "2026-08-21T07:00:00+02:00",
      endsAt: "2026-08-21T16:00:00+02:00",
      location: "Hemv Södra",
      notes: "Hemv Södra, Södra",
    });
    expect(events[0].sourceExcerpt).toContain("Ar");
    expect(events[0].sourceExcerpt).toContain("Bo");
  });

  it("merges adjacent Ob and Ar rows but keeps a shift after a real gap separate", () => {
    const events = mergeMedvindWorkEvents([
      event("2026-09-30T07:00:00+02:00", "2026-09-30T08:00:00+02:00", "Ob"),
      event("2026-09-30T08:00:00+02:00", "2026-09-30T16:00:00+02:00", "Ar", {
        notes: "Bokad för Nadja 08-16 på Ekebacken",
      }),
      event("2026-09-30T18:00:00+02:00", "2026-09-30T21:00:00+02:00", "Ar"),
    ]);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      startsAt: "2026-09-30T07:00:00+02:00",
      endsAt: "2026-09-30T16:00:00+02:00",
      notes: "Bokad för Nadja 08-16 på Ekebacken",
    });
    expect(events[1]).toMatchObject({
      startsAt: "2026-09-30T18:00:00+02:00",
      endsAt: "2026-09-30T21:00:00+02:00",
    });
  });

  it("does not merge An with an ordinary work shift", () => {
    const events = mergeMedvindWorkEvents([
      event("2026-08-10T07:30:00+02:00", "2026-08-10T14:00:00+02:00", "An", {
        notes: "Schemaläggning",
      }),
      event("2026-08-10T14:00:00+02:00", "2026-08-10T16:00:00+02:00", "Ar"),
    ]);

    expect(events).toHaveLength(2);
    expect(events.map((item) => item.title)).toEqual(["Jobb (annat arbete)", "Jobb"]);
  });
});

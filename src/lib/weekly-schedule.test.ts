import { describe, expect, it } from "vitest";

import {
  MAX_REPEAT_WEEKS,
  repeatWeeklyEvents,
  weeksToRepeat,
} from "@/lib/weekly-schedule";

const TIMEZONE = "Europe/Stockholm";

function lesson(startsAt: string, endsAt: string, id = "event-1") {
  return { id, startsAt, endsAt, title: "Matematik" };
}

let counter = 0;
const nextId = () => `copy-${(counter += 1)}`;

describe("weeksToRepeat", () => {
  it("counts only whole extra weeks up to the last day the schedule applies", () => {
    const week = [lesson("2026-08-31T06:10:00.000Z", "2026-08-31T06:50:00.000Z")];

    expect(weeksToRepeat(week, { untilCalendarDate: "2026-09-04", timezone: TIMEZONE })).toBe(0);
    expect(weeksToRepeat(week, { untilCalendarDate: "2026-09-07", timezone: TIMEZONE })).toBe(1);
    expect(weeksToRepeat(week, { untilCalendarDate: "2026-09-13", timezone: TIMEZONE })).toBe(1);
    expect(weeksToRepeat(week, { untilCalendarDate: "2026-09-14", timezone: TIMEZONE })).toBe(2);
  });

  it("measures from the last day of the week, not the first", () => {
    const week = [
      lesson("2026-08-31T06:10:00.000Z", "2026-08-31T06:50:00.000Z"),
      lesson("2026-09-04T06:10:00.000Z", "2026-09-04T07:10:00.000Z", "event-2"),
    ];

    // A Friday lesson one week later lands on 11 September, so 10 September is
    // still the same single week.
    expect(weeksToRepeat(week, { untilCalendarDate: "2026-09-10", timezone: TIMEZONE })).toBe(0);
    expect(weeksToRepeat(week, { untilCalendarDate: "2026-09-11", timezone: TIMEZONE })).toBe(1);
  });

  it("refuses to run away when the end date is far in the future", () => {
    const week = [lesson("2026-08-31T06:10:00.000Z", "2026-08-31T06:50:00.000Z")];

    expect(weeksToRepeat(week, { untilCalendarDate: "2035-01-01", timezone: TIMEZONE })).toBe(
      MAX_REPEAT_WEEKS,
    );
  });

  it("has nothing to repeat without events", () => {
    expect(weeksToRepeat([], { untilCalendarDate: "2026-12-18", timezone: TIMEZONE })).toBe(0);
  });
});

describe("repeatWeeklyEvents", () => {
  it("returns the original week untouched when nothing repeats", () => {
    const week = [lesson("2026-08-31T06:10:00.000Z", "2026-08-31T06:50:00.000Z")];

    expect(
      repeatWeeklyEvents(week, { untilCalendarDate: "2026-09-04", timezone: TIMEZONE }, nextId),
    ).toEqual(week);
  });

  it("copies every lesson once per additional week and gives each copy its own id", () => {
    const week = [
      lesson("2026-08-31T06:10:00.000Z", "2026-08-31T06:50:00.000Z"),
      lesson("2026-09-04T06:10:00.000Z", "2026-09-04T07:10:00.000Z", "event-2"),
    ];

    const expanded = repeatWeeklyEvents(
      week,
      { untilCalendarDate: "2026-09-18", timezone: TIMEZONE },
      nextId,
    );

    expect(expanded).toHaveLength(6);
    expect(new Set(expanded.map((event) => event.id)).size).toBe(6);
    expect(expanded[0]).toEqual(week[0]);
  });

  it("keeps the wall clock across the October clock change", () => {
    // 08:10 Swedish time on 19 October, repeated past the last Sunday of the
    // month. Adding seven times twenty-four hours would move it to 07:10.
    const week = [lesson("2026-10-19T06:10:00.000Z", "2026-10-19T06:50:00.000Z")];

    const expanded = repeatWeeklyEvents(
      week,
      { untilCalendarDate: "2026-11-02", timezone: TIMEZONE },
      nextId,
    );

    const clock = (iso: string) =>
      new Intl.DateTimeFormat("sv-SE", {
        timeZone: TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));

    expect(expanded).toHaveLength(3);
    expect(clock(expanded[1].startsAt)).toBe("08:10");
    expect(clock(expanded[2].startsAt)).toBe("08:10");
    expect(expanded[2].startsAt).toBe("2026-11-02T07:10:00.000Z");
  });

  it("moves the end time with the start so lessons keep their length", () => {
    const week = [lesson("2026-10-19T06:10:00.000Z", "2026-10-19T07:30:00.000Z")];

    const expanded = repeatWeeklyEvents(
      week,
      { untilCalendarDate: "2026-11-02", timezone: TIMEZONE },
      nextId,
    );

    for (const event of expanded) {
      const minutes =
        (new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) / 60_000;
      expect(minutes).toBe(80);
    }
  });
});

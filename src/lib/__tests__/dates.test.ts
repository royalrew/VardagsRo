import { describe, expect, it } from "vitest";

import {
  addCalendarDateDays,
  calendarDateDifference,
  calendarDateInTimeZone,
  calendarDayOfMonth,
  clockValueInTimeZone,
  formatCalendarMonthRange,
  isoWeekNumberForCalendarDate,
  minuteOfDayFromClockValue,
  minuteOfDayInTimeZone,
  resolveCalendarTimeZone,
  startOfCalendarWeek,
  zonedDateTimeToInstant,
} from "@/lib/dates";

const STOCKHOLM = "Europe/Stockholm";

/** Length of a household calendar day in hours, measured in real instants. */
function dayLengthHours(calendarDate: string): number {
  const start = zonedDateTimeToInstant(calendarDate, 0, STOCKHOLM).getTime();
  const end = zonedDateTimeToInstant(addCalendarDateDays(calendarDate, 1), 0, STOCKHOLM).getTime();
  return (end - start) / 3_600_000;
}

describe("household timezone arithmetic", () => {
  it("maps wall time to the same instant no matter what the host timezone is", () => {
    expect(zonedDateTimeToInstant("2026-08-21", 17 * 60 + 15, STOCKHOLM).toISOString()).toBe(
      "2026-08-21T15:15:00.000Z",
    );
    expect(zonedDateTimeToInstant("2026-01-15", 8 * 60, STOCKHOLM).toISOString()).toBe(
      "2026-01-15T07:00:00.000Z",
    );
    expect(zonedDateTimeToInstant("2026-08-21", 17 * 60 + 15, "UTC").toISOString()).toBe(
      "2026-08-21T17:15:00.000Z",
    );
  });

  it("reads the household calendar day from an instant instead of the runtime clock", () => {
    // 23:30 UTC is already the next day in Stockholm. A server rendering in UTC
    // must still agree with the browser about which day this belongs to.
    expect(calendarDateInTimeZone("2026-08-21T23:30:00.000Z", STOCKHOLM)).toBe("2026-08-22");
    expect(calendarDateInTimeZone("2026-08-21T23:30:00.000Z", "UTC")).toBe("2026-08-21");
    expect(minuteOfDayInTimeZone("2026-08-21T23:30:00.000Z", STOCKHOLM)).toBe(60 + 30);
    expect(clockValueInTimeZone("2026-08-21T23:30:00.000Z", STOCKHOLM)).toBe("01:30");
  });

  it("keeps the spring-forward day 23 hours long and pushes a nonexistent time forward", () => {
    expect(dayLengthHours("2026-03-29")).toBe(23);
    // 02:30 does not exist on 2026-03-29 in Stockholm; the clock jumps 02:00 -> 03:00.
    expect(zonedDateTimeToInstant("2026-03-29", 2 * 60 + 30, STOCKHOLM).toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
    expect(clockValueInTimeZone("2026-03-29T01:30:00.000Z", STOCKHOLM)).toBe("03:30");
  });

  it("keeps the fall-back day 25 hours long and resolves an ambiguous time to the earlier instant", () => {
    expect(dayLengthHours("2026-10-25")).toBe(25);
    // 02:30 happens twice on 2026-10-25 in Stockholm. The first one wins.
    expect(zonedDateTimeToInstant("2026-10-25", 2 * 60 + 30, STOCKHOLM).toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });

  it("counts calendar days as days, not as fixed 24-hour blocks", () => {
    expect(calendarDateDifference("2026-03-28", "2026-03-30")).toBe(2);
    expect(calendarDateDifference("2026-10-24", "2026-10-26")).toBe(2);
    expect(addCalendarDateDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addCalendarDateDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(calendarDayOfMonth("2026-08-21")).toBe(21);
  });

  it("starts the week on Monday and numbers ISO weeks across a year boundary", () => {
    expect(startOfCalendarWeek("2026-08-21")).toBe("2026-08-17");
    expect(startOfCalendarWeek("2026-08-17")).toBe("2026-08-17");
    expect(startOfCalendarWeek("2026-08-23")).toBe("2026-08-17");
    expect(isoWeekNumberForCalendarDate("2026-01-01")).toBe(1);
    expect(isoWeekNumberForCalendarDate("2027-01-01")).toBe(53);
    expect(isoWeekNumberForCalendarDate("2027-01-04")).toBe(1);
  });

  it("labels weeks across month and year boundaries", () => {
    expect(formatCalendarMonthRange("2026-08-24", "2026-08-30")).toBe("augusti 2026");
    expect(formatCalendarMonthRange("2026-08-31", "2026-09-06")).toBe(
      "augusti–september 2026",
    );
    expect(formatCalendarMonthRange("2026-12-28", "2027-01-03")).toBe(
      "december 2026–januari 2027",
    );
  });

  it("rejects malformed input instead of silently inventing a time", () => {
    expect(minuteOfDayFromClockValue("07:45")).toBe(7 * 60 + 45);
    expect(minuteOfDayFromClockValue("24:00")).toBeNull();
    expect(minuteOfDayFromClockValue("07:60")).toBeNull();
    expect(minuteOfDayFromClockValue("kvart i åtta")).toBeNull();
    expect(() => zonedDateTimeToInstant("2026-02-30", 0, STOCKHOLM)).toThrow(RangeError);
    expect(() => zonedDateTimeToInstant("2026-08-21", 24 * 60, STOCKHOLM)).toThrow(RangeError);
    expect(resolveCalendarTimeZone("Mars/Olympus")).toBe(STOCKHOLM);
  });
});

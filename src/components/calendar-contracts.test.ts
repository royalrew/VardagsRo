import { describe, expect, it } from "vitest";

import {
  calendarHourRange,
  eventFormDateTimeValues,
  eventIntervalFromForm,
  eventOccursOnCalendarDay,
  eventWriteInput,
  layoutTimedEvents,
  savedEventFromResponse,
  snapMinutesToQuarter,
  suggestEventMove,
  timedEventSegmentForCalendarDay,
} from "@/components/calendar-contracts";
import type { FamilyEvent } from "@/lib/types";

const STOCKHOLM = "Europe/Stockholm";

// Every instant below is written as UTC on purpose. The calendar must produce the
// same rows on a Railway container running in UTC and in a browser in Stockholm,
// so no test here may depend on the timezone of the machine running it.
function familyEvent(overrides: Partial<FamilyEvent> = {}): FamilyEvent {
  return {
    id: "event-1",
    householdId: "household-demo",
    personId: "person-nora",
    documentId: null,
    title: "Fotbollsträning",
    category: "sport",
    startsAt: "2026-08-21T15:15:00.000Z", // 17:15 i Stockholm
    endsAt: "2026-08-21T16:45:00.000Z", // 18:45 i Stockholm
    allDay: false,
    location: "Plan 2",
    notes: "Ta med vattenflaska",
    status: "confirmed",
    confidence: 1,
    sourceExcerpt: null,
    ...overrides,
  };
}

describe("calendar edit contracts", () => {
  it("turns a drop into an immutable proposal with the same clock time and duration", () => {
    const original = familyEvent();
    const proposal = suggestEventMove(original, "2026-08-24", undefined, STOCKHOLM);

    expect(original.startsAt).toBe("2026-08-21T15:15:00.000Z");
    expect(proposal.startsAt).toBe("2026-08-24T15:15:00.000Z");
    expect(Date.parse(proposal.endsAt) - Date.parse(proposal.startsAt)).toBe(90 * 60_000);
    expect(proposal.id).toBe(original.id);
  });

  it("reads the drop target in the household timezone, not the host timezone", () => {
    const original = familyEvent();
    const stockholm = suggestEventMove(original, "2026-08-24", 17 * 60 + 15, STOCKHOLM);
    const utc = suggestEventMove(original, "2026-08-24", 17 * 60 + 15, "UTC");

    // Dropping on the same 17:15 row is a different instant in each zone, which
    // proves the zone comes from the argument and never from the runtime.
    expect(stockholm.startsAt).toBe("2026-08-24T15:15:00.000Z");
    expect(utc.startsAt).toBe("2026-08-24T17:15:00.000Z");
  });

  it("snaps a timed drop to 15 minutes and preserves the event duration", () => {
    const proposal = suggestEventMove(familyEvent(), "2026-08-25", 9 * 60 + 22, STOCKHOLM);

    expect(proposal.startsAt).toBe("2026-08-25T07:15:00.000Z"); // 09:15 i Stockholm
    expect(Date.parse(proposal.endsAt) - Date.parse(proposal.startsAt)).toBe(90 * 60_000);
    expect(snapMinutesToQuarter(9 * 60 + 23)).toBe(9 * 60 + 30);
    expect(snapMinutesToQuarter(24 * 60)).toBe(23 * 60 + 45);
  });

  it("keeps a dropped event on the wall clock across a DST change", () => {
    // Dragging a 17:15 pass onto the fall-back Sunday must still read 17:15 for
    // the family, even though that day is 25 hours long.
    const proposal = suggestEventMove(familyEvent(), "2026-10-25", undefined, STOCKHOLM);
    expect(proposal.startsAt).toBe("2026-10-25T16:15:00.000Z"); // 17:15 CET

    const segment = timedEventSegmentForCalendarDay(proposal, "2026-10-25", STOCKHOLM);
    expect(segment).toMatchObject({ startMinute: 17 * 60 + 15, endMinute: 18 * 60 + 45 });
  });

  it("lays overlapping timed events side by side while reusing free columns", () => {
    const layout = layoutTimedEvents([
      { id: "a", startMinute: 540, endMinute: 660 },
      { id: "b", startMinute: 600, endMinute: 720 },
      { id: "c", startMinute: 660, endMinute: 780 },
      { id: "d", startMinute: 900, endMinute: 960 },
    ]);
    const byId = Object.fromEntries(layout.map((item) => [item.id, item]));

    expect(byId.a).toMatchObject({ column: 0, columnCount: 2 });
    expect(byId.b).toMatchObject({ column: 1, columnCount: 2 });
    expect(byId.c).toMatchObject({ column: 0, columnCount: 2 });
    expect(byId.d).toMatchObject({ column: 0, columnCount: 1 });
  });

  it("splits an overnight event across both days and expands the visible hours", () => {
    const overnight = familyEvent({
      startsAt: "2026-08-21T20:00:00.000Z", // 22:00 i Stockholm
      endsAt: "2026-08-21T23:00:00.000Z", // 01:00 natten mot den 22:a
    });

    const firstPart = timedEventSegmentForCalendarDay(overnight, "2026-08-21", STOCKHOLM);
    const secondPart = timedEventSegmentForCalendarDay(overnight, "2026-08-22", STOCKHOLM);

    expect(firstPart).toEqual({
      startMinute: 22 * 60,
      endMinute: 24 * 60,
      continuesBefore: false,
      continuesAfter: true,
    });
    expect(secondPart).toEqual({
      startMinute: 0,
      endMinute: 60,
      continuesBefore: true,
      continuesAfter: false,
    });
    expect(timedEventSegmentForCalendarDay(overnight, "2026-08-23", STOCKHOLM)).toBeNull();
    expect(calendarHourRange([firstPart!, secondPart!])).toEqual({ firstHour: 0, lastHour: 24 });
  });

  it("puts a late-evening UTC instant on the correct Stockholm day", () => {
    // 23:30 UTC is 01:30 the next morning in Stockholm. Rendering this on the UTC
    // day was the concrete Railway-versus-Stockholm bug.
    const afterMidnight = familyEvent({
      startsAt: "2026-08-21T23:30:00.000Z",
      endsAt: "2026-08-22T00:30:00.000Z",
    });

    expect(eventOccursOnCalendarDay(afterMidnight, "2026-08-21", STOCKHOLM)).toBe(false);
    expect(eventOccursOnCalendarDay(afterMidnight, "2026-08-22", STOCKHOLM)).toBe(true);
    expect(timedEventSegmentForCalendarDay(afterMidnight, "2026-08-22", STOCKHOLM)).toMatchObject({
      startMinute: 60 + 30,
      endMinute: 2 * 60 + 30,
    });
  });

  it("shows every covered day of a multi-day all-day event but treats its end as exclusive", () => {
    const allDay = familyEvent({
      allDay: true,
      startsAt: "2026-08-20T22:00:00.000Z", // 2026-08-21 00:00 i Stockholm
      endsAt: "2026-08-23T22:00:00.000Z", // 2026-08-24 00:00 i Stockholm
    });

    expect(eventOccursOnCalendarDay(allDay, "2026-08-21", STOCKHOLM)).toBe(true);
    expect(eventOccursOnCalendarDay(allDay, "2026-08-23", STOCKHOLM)).toBe(true);
    expect(eventOccursOnCalendarDay(allDay, "2026-08-24", STOCKHOLM)).toBe(false);
    expect(timedEventSegmentForCalendarDay(allDay, "2026-08-21", STOCKHOLM)).toBeNull();
  });

  it("only sends editable fields and keeps provenance outside the mutation", () => {
    const input = eventWriteInput(familyEvent({ documentId: "document-1", sourceExcerpt: "text" }));

    expect(Object.keys(input).sort()).toEqual(
      ["allDay", "category", "endsAt", "location", "notes", "personId", "startsAt", "title"].sort(),
    );
    expect(input).not.toHaveProperty("documentId");
    expect(input).not.toHaveProperty("sourceExcerpt");
  });

  it("keeps overnight events valid while rejecting an unchanged zero-length time", () => {
    const overnight = eventIntervalFromForm(
      "2026-08-24",
      "22:00",
      "01:00",
      false,
      undefined,
      STOCKHOLM,
    );

    expect(overnight).not.toBeNull();
    expect(overnight!.startsAt.toISOString()).toBe("2026-08-24T20:00:00.000Z");
    expect(overnight!.endsAt.toISOString()).toBe("2026-08-24T23:00:00.000Z");
    expect(overnight!.endsAt.getTime() - overnight!.startsAt.getTime()).toBe(3 * 60 * 60_000);
    expect(
      eventIntervalFromForm("2026-08-24", "22:00", "22:00", false, undefined, STOCKHOLM),
    ).toBeNull();
    expect(
      eventIntervalFromForm("2026-08-24", "22:00", "kvart", false, undefined, STOCKHOLM),
    ).toBeNull();
    expect(
      eventIntervalFromForm("2026-02-30", "08:00", "09:00", false, undefined, STOCKHOLM),
    ).toBeNull();
  });

  it("gives an overnight pass its real length even when the clock moves", () => {
    // The clock jumps at 02:00, so a 22:00-04:00 pass is the one that crosses it.
    // Six hours on the wall are five real hours the night the clock springs
    // forward, and seven real hours the night it falls back.
    const shortNight = eventIntervalFromForm(
      "2026-03-28",
      "22:00",
      "04:00",
      false,
      undefined,
      STOCKHOLM,
    );
    expect(shortNight!.startsAt.toISOString()).toBe("2026-03-28T21:00:00.000Z");
    expect(shortNight!.endsAt.toISOString()).toBe("2026-03-29T02:00:00.000Z");
    expect(shortNight!.endsAt.getTime() - shortNight!.startsAt.getTime()).toBe(5 * 60 * 60_000);

    const longNight = eventIntervalFromForm(
      "2026-10-24",
      "22:00",
      "04:00",
      false,
      undefined,
      STOCKHOLM,
    );
    expect(longNight!.startsAt.toISOString()).toBe("2026-10-24T20:00:00.000Z");
    expect(longNight!.endsAt.toISOString()).toBe("2026-10-25T03:00:00.000Z");
    expect(longNight!.endsAt.getTime() - longNight!.startsAt.getTime()).toBe(7 * 60 * 60_000);
  });

  it("preserves a multi-day all-day span through drag and modal form values", () => {
    const original = familyEvent({
      allDay: true,
      startsAt: "2026-08-20T22:00:00.000Z", // 2026-08-21 i Stockholm
      endsAt: "2026-08-23T22:00:00.000Z", // slutet är exklusivt: 2026-08-24
    });
    const proposal = suggestEventMove(original, "2026-08-27", undefined, STOCKHOLM);
    const form = eventFormDateTimeValues(proposal.startsAt, proposal.endsAt, STOCKHOLM);
    const interval = eventIntervalFromForm(
      form.date,
      form.startTime,
      form.endTime,
      true,
      form.allDayEndDate,
      STOCKHOLM,
    );

    expect(form.date).toBe("2026-08-27");
    expect(form.allDayEndDate).toBe("2026-08-30");
    expect(interval).not.toBeNull();
    expect(interval!.startsAt.toISOString()).toBe("2026-08-26T22:00:00.000Z");
    expect(interval!.endsAt.toISOString()).toBe("2026-08-29T22:00:00.000Z");
    expect(
      eventIntervalFromForm(form.date, "00:00", "00:00", true, form.date, STOCKHOLM),
    ).toBeNull();
  });

  it("requires a complete matching server event before accepting a PATCH result", () => {
    const event = familyEvent();
    expect(savedEventFromResponse({ event }, event.id)).toEqual(event);
    expect(savedEventFromResponse({ event: { ...event, id: "other" } }, event.id)).toBeNull();
    expect(savedEventFromResponse({ event: { ...event, notes: undefined } }, event.id)).toBeNull();
  });
});

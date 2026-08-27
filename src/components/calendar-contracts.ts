import {
  DEFAULT_TIME_ZONE,
  addCalendarDateDays,
  calendarDateDifference,
  calendarDateInTimeZone,
  clockValueInTimeZone,
  minuteOfDayFromClockValue,
  minuteOfDayInTimeZone,
  zonedDateTimeToInstant,
} from "@/lib/dates";
import type { EventCategory, FamilyEvent } from "@/lib/types";

export interface EventWriteInput {
  /** null means the event concerns the whole family. */
  personId: string | null;
  title: string;
  category: EventCategory;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  notes: string | null;
}

export interface EventInterval {
  startsAt: Date;
  endsAt: Date;
}

export interface EventFormDateTimeValues {
  date: string;
  allDayEndDate: string;
  startTime: string;
  endTime: string;
}

export interface TimedEventLayoutInput {
  id: string;
  startMinute: number;
  endMinute: number;
}

export interface TimedEventLayout extends TimedEventLayoutInput {
  column: number;
  columnCount: number;
}

export interface CalendarDayEventSegment {
  startMinute: number;
  endMinute: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface CalendarHourRange {
  firstHour: number;
  lastHour: number;
}

const categories = new Set<EventCategory>([
  "work",
  "school",
  "sport",
  "health",
  "family",
  "other",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

export function eventWriteInput(event: FamilyEvent): EventWriteInput {
  return {
    personId: event.personId,
    title: event.title,
    category: event.category,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    location: event.location,
    notes: event.notes,
  };
}

/**
 * Build the modal's date and time fields from stored instants, read in the
 * household timezone rather than the runtime's. A server rendering in UTC and a
 * browser in Europe/Stockholm therefore agree on the same calendar day.
 */
export function eventFormDateTimeValues(
  startsAt: string | Date,
  endsAt: string | Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): EventFormDateTimeValues {
  const date = calendarDateInTimeZone(startsAt, timeZone);
  let allDayEndDate = calendarDateInTimeZone(endsAt, timeZone);
  if (allDayEndDate <= date) allDayEndDate = addCalendarDateDays(date, 1);
  return {
    date,
    allDayEndDate,
    startTime: clockValueInTimeZone(startsAt, timeZone),
    endTime: clockValueInTimeZone(endsAt, timeZone),
  };
}

/**
 * Turn household-local form values into instants. An end time before the start
 * time means an overnight pass and rolls to the next calendar day; an unchanged
 * zero-length time is rejected.
 */
export function eventIntervalFromForm(
  date: string,
  startTime: string,
  endTime: string,
  allDay: boolean,
  allDayEndDate?: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): EventInterval | null {
  try {
    if (allDay) {
      if (!allDayEndDate || allDayEndDate <= date) return null;
      return {
        startsAt: zonedDateTimeToInstant(date, 0, timeZone),
        endsAt: zonedDateTimeToInstant(allDayEndDate, 0, timeZone),
      };
    }

    const startMinute = minuteOfDayFromClockValue(startTime);
    const endMinute = minuteOfDayFromClockValue(endTime);
    if (startMinute === null || endMinute === null || startMinute === endMinute) return null;

    const startsAt = zonedDateTimeToInstant(date, startMinute, timeZone);
    const endsAt =
      endMinute < startMinute
        ? zonedDateTimeToInstant(addCalendarDateDays(date, 1), endMinute, timeZone)
        : zonedDateTimeToInstant(date, endMinute, timeZone);
    return { startsAt, endsAt };
  } catch {
    return null;
  }
}

export function savedEventFromResponse(value: unknown, expectedId?: string): FamilyEvent | null {
  if (!isRecord(value)) return null;
  const candidate = isRecord(value.event) ? value.event : value;
  if (
    typeof candidate.id !== "string" ||
    (expectedId !== undefined && candidate.id !== expectedId) ||
    typeof candidate.householdId !== "string" ||
    !isNullableString(candidate.personId) ||
    !isNullableString(candidate.documentId) ||
    typeof candidate.title !== "string" ||
    typeof candidate.category !== "string" ||
    !categories.has(candidate.category as EventCategory) ||
    typeof candidate.startsAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.startsAt)) ||
    typeof candidate.endsAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.endsAt)) ||
    typeof candidate.allDay !== "boolean" ||
    !isNullableString(candidate.location) ||
    !isNullableString(candidate.notes) ||
    (candidate.status !== "confirmed" && candidate.status !== "needs_review") ||
    typeof candidate.confidence !== "number" ||
    !isNullableString(candidate.sourceExcerpt)
  ) {
    return null;
  }
  return candidate as unknown as FamilyEvent;
}

/** Snap a vertical calendar position to a valid quarter-hour in the same day. */
export function snapMinutesToQuarter(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.min(23 * 60 + 45, Math.max(0, Math.round(minutes / 15) * 15));
}

/**
 * Give overlapping timed events stable side-by-side columns. Touching intervals
 * (for example 10:00–11:00 and 11:00–12:00) do not overlap.
 */
export function layoutTimedEvents(items: TimedEventLayoutInput[]): TimedEventLayout[] {
  const sorted = [...items]
    .filter((item) => item.endMinute > item.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute || a.id.localeCompare(b.id));
  const result: TimedEventLayout[] = [];
  let cluster: TimedEventLayoutInput[] = [];
  let clusterEnd = -1;

  function finishCluster() {
    if (!cluster.length) return;
    const columnEnds: number[] = [];
    const positioned = cluster.map((item) => {
      let column = columnEnds.findIndex((endMinute) => endMinute <= item.startMinute);
      if (column === -1) column = columnEnds.length;
      columnEnds[column] = item.endMinute;
      return { ...item, column, columnCount: 0 };
    });
    const columnCount = Math.max(1, columnEnds.length);
    result.push(...positioned.map((item) => ({ ...item, columnCount })));
    cluster = [];
    clusterEnd = -1;
  }

  for (const item of sorted) {
    if (cluster.length && item.startMinute >= clusterEnd) finishCluster();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMinute);
  }
  finishCluster();
  return result;
}

function dayBounds(calendarDate: string, timeZone: string): { dayStart: number; dayEnd: number } {
  return {
    dayStart: zonedDateTimeToInstant(calendarDate, 0, timeZone).getTime(),
    dayEnd: zonedDateTimeToInstant(addCalendarDateDays(calendarDate, 1), 0, timeZone).getTime(),
  };
}

/**
 * Does the event touch this household calendar day? Day edges are real instants
 * for the timezone, so a DST day is correctly 23 or 25 hours long.
 */
export function eventOccursOnCalendarDay(
  event: FamilyEvent,
  calendarDate: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): boolean {
  const startsAt = Date.parse(event.startsAt);
  const endsAt = Date.parse(event.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return false;
  const { dayStart, dayEnd } = dayBounds(calendarDate, timeZone);
  return startsAt < dayEnd && endsAt > dayStart;
}

/**
 * Split an overnight or multi-day timed event into the part visible on one
 * household calendar day. Minutes are wall-clock minutes so they land on the
 * rendered hour axis, and the day edges decide what is clamped.
 */
export function timedEventSegmentForCalendarDay(
  event: FamilyEvent,
  calendarDate: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): CalendarDayEventSegment | null {
  if (event.allDay || !eventOccursOnCalendarDay(event, calendarDate, timeZone)) return null;
  const startsAt = Date.parse(event.startsAt);
  const endsAt = Date.parse(event.endsAt);
  const { dayStart, dayEnd } = dayBounds(calendarDate, timeZone);
  const startMinute = startsAt <= dayStart ? 0 : minuteOfDayInTimeZone(startsAt, timeZone);
  const endMinute = endsAt >= dayEnd ? 24 * 60 : minuteOfDayInTimeZone(endsAt, timeZone);
  if (endMinute <= startMinute) return null;
  return {
    startMinute,
    endMinute,
    continuesBefore: startsAt < dayStart,
    continuesAfter: endsAt > dayEnd,
  };
}

export function calendarHourRange(
  segments: Array<Pick<CalendarDayEventSegment, "startMinute" | "endMinute">>,
  defaultFirstHour = 6,
  defaultLastHour = 22,
): CalendarHourRange {
  const validSegments = segments.filter(
    (segment) => Number.isFinite(segment.startMinute) && Number.isFinite(segment.endMinute) && segment.endMinute > segment.startMinute,
  );
  const earliest = validSegments.length
    ? Math.min(...validSegments.map((segment) => segment.startMinute))
    : defaultFirstHour * 60;
  const latest = validSegments.length
    ? Math.max(...validSegments.map((segment) => segment.endMinute))
    : defaultLastHour * 60;
  return {
    firstHour: Math.max(0, Math.min(defaultFirstHour, Math.floor(earliest / 60))),
    lastHour: Math.min(24, Math.max(defaultLastHour, Math.ceil(latest / 60))),
  };
}

/**
 * Propose a moved event from a drag. Timed drops keep the duration in real time;
 * all-day drops keep the number of covered days. Nothing is written here - the
 * proposal still has to pass through the modal and an explicit confirmation.
 */
export function suggestEventMove(
  event: FamilyEvent,
  targetDate: string,
  targetMinute?: number,
  timeZone: string = DEFAULT_TIME_ZONE,
): FamilyEvent {
  const startsAt = Date.parse(event.startsAt);
  const endsAt = Date.parse(event.endsAt);

  if (event.allDay) {
    const daySpan = Math.max(
      1,
      calendarDateDifference(
        calendarDateInTimeZone(startsAt, timeZone),
        calendarDateInTimeZone(endsAt, timeZone),
      ),
    );
    return {
      ...event,
      startsAt: zonedDateTimeToInstant(targetDate, 0, timeZone).toISOString(),
      endsAt: zonedDateTimeToInstant(
        addCalendarDateDays(targetDate, daySpan),
        0,
        timeZone,
      ).toISOString(),
    };
  }

  const durationMs = endsAt - startsAt;
  const minute =
    targetMinute === undefined
      ? minuteOfDayInTimeZone(startsAt, timeZone)
      : snapMinutesToQuarter(targetMinute);
  const proposedStart = zonedDateTimeToInstant(targetDate, minute, timeZone);
  return {
    ...event,
    startsAt: proposedStart.toISOString(),
    endsAt: new Date(proposedStart.getTime() + durationMs).toISOString(),
  };
}

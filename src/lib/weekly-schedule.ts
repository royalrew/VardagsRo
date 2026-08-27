import {
  addCalendarDateDays,
  calendarDateDifference,
  calendarDateInTimeZone,
  minuteOfDayInTimeZone,
  zonedDateTimeToInstant,
} from "@/lib/dates";
import type { FamilyEvent } from "@/lib/types";

/**
 * A school timetable is printed for one week, but it is the week that repeats
 * until something changes: a term ends, or in this family's case a move to
 * another town. Uploading the same picture every week is not a product.
 *
 * The repeat is materialised into ordinary events rather than modelled as a
 * recurrence rule. Every event in the household already has a concrete start
 * and end, and the calendar, the editor and the question engine all rely on
 * that. The copies share the source document, so removing the document removes
 * the whole repeat in one step.
 */

/** A repeat longer than this is almost certainly a mistake, not a term. */
export const MAX_REPEAT_WEEKS = 30;

export interface WeeklyRepeat {
  /** Last calendar date the schedule applies to, inclusive, as YYYY-MM-DD. */
  untilCalendarDate: string;
  timezone: string;
}

function shiftedByWeeks(isoInstant: string, weeks: number, timezone: string): string {
  const calendarDate = calendarDateInTimeZone(isoInstant, timezone);
  const minuteOfDay = minuteOfDayInTimeZone(isoInstant, timezone);
  const shifted = addCalendarDateDays(calendarDate, weeks * 7);
  // Resolved through the wall clock, not by adding 7×24 hours: the clocks change
  // in late October, and a lesson at 08:10 stays at 08:10 either side of it.
  return zonedDateTimeToInstant(shifted, minuteOfDay, timezone).toISOString();
}

/**
 * Returns the number of extra weeks that fit between the schedule's own week and
 * the last day it applies to. Zero means the schedule covers its own week only.
 */
export function weeksToRepeat(
  events: readonly Pick<FamilyEvent, "startsAt">[],
  repeat: WeeklyRepeat,
): number {
  if (events.length === 0) return 0;

  const lastDay = events.reduce((latest, event) => {
    const day = calendarDateInTimeZone(event.startsAt, repeat.timezone);
    return day > latest ? day : latest;
  }, calendarDateInTimeZone(events[0].startsAt, repeat.timezone));

  const days = calendarDateDifference(lastDay, repeat.untilCalendarDate);
  if (days < 7) return 0;
  return Math.min(Math.floor(days / 7), MAX_REPEAT_WEEKS);
}

/**
 * Expands one week of events across the weeks it also applies to. The original
 * week is returned first and unchanged, so a schedule that repeats nowhere is
 * exactly the schedule that was read.
 */
export function repeatWeeklyEvents<T extends Pick<FamilyEvent, "startsAt" | "endsAt">>(
  events: readonly T[],
  repeat: WeeklyRepeat,
  makeId: () => string,
): T[] {
  const weeks = weeksToRepeat(events, repeat);
  if (weeks === 0) return [...events];

  const expanded: T[] = [...events];
  for (let week = 1; week <= weeks; week += 1) {
    for (const event of events) {
      expanded.push({
        ...event,
        id: makeId(),
        startsAt: shiftedByWeeks(event.startsAt, week, repeat.timezone),
        endsAt: shiftedByWeeks(event.endsAt, week, repeat.timezone),
      });
    }
  }
  return expanded;
}

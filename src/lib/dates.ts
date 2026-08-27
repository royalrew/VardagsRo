const locale = "sv-SE";
export const DEFAULT_TIME_ZONE = "Europe/Stockholm";
const timezone = DEFAULT_TIME_ZONE;

export interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const zonedFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function resolveCalendarTimeZone(value: string): string {
  try {
    return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  const safeTimeZone = resolveCalendarTimeZone(timeZone);
  const cached = zonedFormatterCache.get(safeTimeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-CA-u-nu-latn", {
    timeZone: safeTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  zonedFormatterCache.set(safeTimeZone, formatter);
  return formatter;
}

export function zonedDateTimeParts(
  value: string | number | Date,
  timeZone: string,
): ZonedDateTimeParts {
  const parts = zonedFormatter(timeZone).formatToParts(new Date(value));
  const numberPart = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: numberPart("year"),
    month: numberPart("month"),
    day: numberPart("day"),
    hour: numberPart("hour"),
    minute: numberPart("minute"),
    second: numberPart("second"),
  };
}

function calendarDateFromParts(parts: Pick<ZonedDateTimeParts, "year" | "month" | "day">): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}`;
}

function parseCalendarDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Ogiltigt kalenderdatum.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError("Ogiltigt kalenderdatum.");
  }
  return { year, month, day };
}

export function calendarDateInTimeZone(value: string | number | Date, timeZone: string): string {
  return calendarDateFromParts(zonedDateTimeParts(value, timeZone));
}

export function calendarDayOfMonth(calendarDate: string): number {
  return parseCalendarDate(calendarDate).day;
}

export function addCalendarDateDays(calendarDate: string, days: number): string {
  const parts = parseCalendarDate(calendarDate);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return calendarDateFromParts({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function calendarDateDifference(from: string, to: string): number {
  const fromParts = parseCalendarDate(from);
  const toParts = parseCalendarDate(to);
  const fromValue = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);
  const toValue = Date.UTC(toParts.year, toParts.month - 1, toParts.day);
  return Math.round((toValue - fromValue) / 86_400_000);
}

export function startOfCalendarWeek(calendarDate: string): string {
  const parts = parseCalendarDate(calendarDate);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return addCalendarDateDays(calendarDate, -mondayOffset);
}

export function isoWeekNumberForCalendarDate(calendarDate: string): number {
  const parts = parseCalendarDate(calendarDate);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export function formatCalendarMonthYear(calendarDate: string): string {
  const parts = parseCalendarDate(calendarDate);
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, 15, 12)));
}

export function formatCalendarMonthRange(from: string, to: string): string {
  const start = parseCalendarDate(from);
  const end = parseCalendarDate(to);
  if (start.year === end.year && start.month === end.month) {
    return formatCalendarMonthYear(from);
  }

  const monthName = (parts: { year: number; month: number }) =>
    new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(parts.year, parts.month - 1, 15, 12)),
    );
  if (start.year === end.year) {
    return `${monthName(start)}–${monthName(end)} ${end.year}`;
  }
  return `${monthName(start)} ${start.year}–${monthName(end)} ${end.year}`;
}

function wallTimeScalar(parts: ZonedDateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/**
 * Convert a household-local wall time to an instant without consulting the
 * runtime's timezone. Ambiguous fall-back times choose the earlier instant;
 * nonexistent spring-forward times move forward by the DST gap.
 */
export function zonedDateTimeToInstant(
  calendarDate: string,
  minuteOfDay: number,
  timeZone: string,
): Date {
  const date = parseCalendarDate(calendarDate);
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay >= 24 * 60) {
    throw new RangeError("Ogiltig tid på kalenderdagen.");
  }
  const safeTimeZone = resolveCalendarTimeZone(timeZone);
  const desired: ZonedDateTimeParts = {
    ...date,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    second: 0,
  };
  const desiredScalar = wallTimeScalar(desired);
  const offsets = new Set<number>();
  for (const deltaHours of [-48, -24, -12, 0, 12, 24, 48]) {
    const sample = desiredScalar + deltaHours * 60 * 60_000;
    const parts = zonedDateTimeParts(new Date(sample), safeTimeZone);
    offsets.add(wallTimeScalar(parts) - sample);
  }

  const candidates = [...offsets].map((offset) => {
    const instant = desiredScalar - offset;
    const rendered = zonedDateTimeParts(new Date(instant), safeTimeZone);
    return { instant, renderedScalar: wallTimeScalar(rendered) };
  });
  const exact = candidates
    .filter((candidate) => candidate.renderedScalar === desiredScalar)
    .sort((a, b) => a.instant - b.instant)[0];
  if (exact) return new Date(exact.instant);

  const shiftedForward = candidates
    .filter((candidate) => candidate.renderedScalar > desiredScalar)
    .sort((a, b) => a.renderedScalar - b.renderedScalar || a.instant - b.instant)[0];
  if (shiftedForward) return new Date(shiftedForward.instant);
  throw new RangeError("Tiden kan inte placeras i den valda tidszonen.");
}

/** Wall-clock minute of the day (0-1439) for an instant, in an explicit timezone. */
export function minuteOfDayInTimeZone(value: string | number | Date, timeZone: string): number {
  const parts = zonedDateTimeParts(value, timeZone);
  return parts.hour * 60 + parts.minute;
}

/** Zero-padded wall-clock "HH:MM" for an instant, in an explicit timezone. */
export function clockValueInTimeZone(value: string | number | Date, timeZone: string): string {
  const minute = minuteOfDayInTimeZone(value, timeZone);
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** Parse an "HH:MM" form value into a minute of the day, or null when invalid. */
export function minuteOfDayFromClockValue(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export const WEEKDAY_SHORT = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

export function startOfLocalWeek(date = new Date()): Date {
  const result = new Date(date);
  const mondayOffset = (result.getDay() + 6) % 7;
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - mondayOffset);
  return result;
}

export function addLocalDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function atLocalTime(day: Date, hours: number, minutes = 0): Date {
  const result = new Date(day);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function formatClock(value: string | Date, timeZone = timezone): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: resolveCalendarTimeZone(timeZone),
  })
    .format(new Date(value))
    .replace(":", ".");
}

export function formatLongDate(value: string | Date): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  }).format(new Date(value));
}

export function formatCompactDate(value: string | Date): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export function formatTimeRange(
  startsAt: string,
  endsAt: string,
  allDay = false,
  timeZone = timezone,
): string {
  if (allDay) return "Hela dagen";
  return `${formatClock(startsAt, timeZone)}–${formatClock(endsAt, timeZone)}`;
}

export function isSameLocalDay(
  a: string | Date,
  b: string | Date,
  timeZone = timezone,
): boolean {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: resolveCalendarTimeZone(timeZone),
  });
  return formatter.format(new Date(a)) === formatter.format(new Date(b));
}

export function minutesOfOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): number {
  const start = Math.max(new Date(aStart).getTime(), new Date(bStart).getTime());
  const end = Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime());
  return Math.max(0, Math.round((end - start) / 60_000));
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} tim ${rest} min` : `${hours} tim`;
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

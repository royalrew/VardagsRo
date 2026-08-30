import "server-only";

import { cache } from "react";
import { headers } from "next/headers";

import {
  addCalendarDateDays,
  calendarDateInTimeZone,
  startOfCalendarWeek,
  zonedDateTimeToInstant,
} from "@/lib/dates";
import { createDemoData } from "@/lib/demo-data";
import { requireActorFromHeaders } from "@/server/actor";
import type { ActorContext } from "@/server/authorization-types";
import { databaseUrl, demoFallbackAllowed } from "@/server/config";
import { readyClient } from "@/server/database";
import { AppError } from "@/server/errors";

/** One verified identity per render, shared by the workspace layout and page. */
export const requireProject100Actor = cache(async (): Promise<ActorContext> => {
  return requireActorFromHeaders(await headers());
});

export function assertProject100Adult(actor: ActorContext): void {
  if (actor.personType !== "adult") {
    throw new AppError(403, "PROJECT100_ADULT_ONLY", "Projekt 100 är en privat vuxenyta.");
  }
}

export interface Project100WorkEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
}

export interface Project100WorkSchedule {
  timeZone: string;
  today: string;
  weekStart: string;
  weekEndExclusive: string;
  workEvents: Project100WorkEvent[];
}

export interface Project100WorkHorizon {
  timeZone: string;
  today: string;
  workEvents: Project100WorkEvent[];
}

interface TimeZoneRow {
  timezone: string;
}

interface WorkEventRow {
  id: string;
  title: string;
  starts_at: Date | string;
  ends_at: Date | string;
  all_day: boolean;
  location: string | null;
}

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function workEvent(row: WorkEventRow): Project100WorkEvent {
  return {
    id: row.id,
    title: row.title,
    startsAt: asIso(row.starts_at),
    endsAt: asIso(row.ends_at),
    allDay: row.all_day,
    location: row.location,
  };
}

/**
 * The first work pass that has not ended yet. Reading the clock belongs here
 * rather than in a page, where a re-render would silently change the answer.
 */
export function nextProject100WorkEvent(
  schedule: Project100WorkSchedule,
  at: Date = new Date(),
): Project100WorkEvent | null {
  const from = at.getTime();
  return (
    schedule.workEvents.find((event) => new Date(event.endsAt).getTime() >= from) ?? null
  );
}

/** The next shift that has not started yet; current shifts are not described as upcoming. */
export function nextProject100WorkStart(
  workEvents: Project100WorkEvent[],
  at: Date = new Date(),
): Project100WorkEvent | null {
  const from = at.getTime();
  return (
    workEvents.find((event) => new Date(event.startsAt).getTime() >= from) ?? null
  );
}

export function minutesUntilProject100WorkStart(
  event: Project100WorkEvent | null,
  at: Date = new Date(),
): number | null {
  if (!event) return null;
  return Math.max(0, Math.ceil((new Date(event.startsAt).getTime() - at.getTime()) / 60_000));
}

/**
 * Reads only the signed-in person's confirmed work rows for one calendar week.
 * The caller can choose a date, never an identity. Work remains in the family
 * calendar; this DTO is only a read-only view over it.
 */
export async function loadProject100WorkSchedule(
  actor: ActorContext,
  selectedCalendarDate?: string,
): Promise<Project100WorkSchedule> {
  assertProject100Adult(actor);

  if (!databaseUrl() && demoFallbackAllowed()) {
    const demo = createDemoData();
    const today = calendarDateInTimeZone(new Date(), demo.timezone);
    const weekStart = startOfCalendarWeek(selectedCalendarDate ?? today);
    const weekEndExclusive = addCalendarDateDays(weekStart, 7);
    const from = zonedDateTimeToInstant(weekStart, 0, demo.timezone).getTime();
    const to = zonedDateTimeToInstant(weekEndExclusive, 0, demo.timezone).getTime();
    return {
      timeZone: demo.timezone,
      today,
      weekStart,
      weekEndExclusive,
      workEvents: demo.events
        .filter(
          (event) =>
            event.householdId === actor.householdId &&
            event.personId === actor.personId &&
            event.category === "work" &&
            event.status === "confirmed" &&
            new Date(event.startsAt).getTime() < to &&
            new Date(event.endsAt).getTime() > from,
        )
        .map((event) => ({
          id: event.id,
          title: event.title,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          allDay: event.allDay,
          location: event.location,
        }))
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
    };
  }

  const sql = await readyClient();
  const householdRows = await sql<TimeZoneRow[]>`
    select timezone
    from family_households
    where id = ${actor.householdId}
    limit 1
  `;
  const timeZone = householdRows[0]?.timezone;
  if (!timeZone) {
    throw new AppError(503, "HOUSEHOLD_NOT_CONFIGURED", "Hushållets tidszon saknas.");
  }

  const today = calendarDateInTimeZone(new Date(), timeZone);
  let weekStart: string;
  try {
    weekStart = startOfCalendarWeek(selectedCalendarDate ?? today);
  } catch (cause) {
    throw new AppError(400, "PROJECT100_INVALID_WEEK", "Veckan går inte att läsa.", {
      cause,
    });
  }
  const weekEndExclusive = addCalendarDateDays(weekStart, 7);
  const from = zonedDateTimeToInstant(weekStart, 0, timeZone);
  const to = zonedDateTimeToInstant(weekEndExclusive, 0, timeZone);

  const rows = await sql<WorkEventRow[]>`
    select id, title, starts_at, ends_at, all_day, location
    from family_events
    where household_id = ${actor.householdId}
      and person_id = ${actor.personId}
      and category = 'work'
      and status = 'confirmed'
      and starts_at < ${to}
      and ends_at > ${from}
    order by starts_at asc, ends_at asc, id asc
  `;

  return {
    timeZone,
    today,
    weekStart,
    weekEndExclusive,
    workEvents: rows.map(workEvent),
  };
}

/**
 * Nutrition needs enough look-ahead to see a shift after the current week's
 * Sunday. The two read-only schedule windows still point at the family calendar
 * and are only combined in memory; no work row is copied into Projekt 100.
 */
export async function loadProject100WorkHorizon(
  actor: ActorContext,
): Promise<Project100WorkHorizon> {
  const current = await loadProject100WorkSchedule(actor);
  const following = await loadProject100WorkSchedule(actor, current.weekEndExclusive);
  const byId = new Map<string, Project100WorkEvent>();
  for (const event of [...current.workEvents, ...following.workEvents]) {
    byId.set(event.id, event);
  }
  return {
    timeZone: current.timeZone,
    today: current.today,
    workEvents: [...byId.values()].sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
  };
}

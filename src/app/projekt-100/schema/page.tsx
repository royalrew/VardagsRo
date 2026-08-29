import type { Metadata } from "next";
import {
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Dumbbell,
  MapPin,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";

import {
  addCalendarDateDays,
  formatTimeRange,
  minuteOfDayInTimeZone,
  zonedDateTimeToInstant,
} from "@/lib/dates";
import {
  assertProject100Adult,
  loadProject100WorkSchedule,
  requireProject100Actor,
  type Project100WorkEvent,
} from "@/server/project100";

export const metadata: Metadata = { title: "Schema" };

const dayName = new Intl.DateTimeFormat("sv-SE", { weekday: "long", timeZone: "UTC" });
const dateName = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", timeZone: "UTC" });

function calendarDateValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function eventsOnDay(
  events: Project100WorkEvent[],
  calendarDate: string,
  timeZone: string,
) {
  const from = zonedDateTimeToInstant(calendarDate, 0, timeZone).getTime();
  const to = zonedDateTimeToInstant(addCalendarDateDays(calendarDate, 1), 0, timeZone).getTime();
  return events.filter(
    (event) =>
      new Date(event.startsAt).getTime() < to && new Date(event.endsAt).getTime() > from,
  );
}

function trainingWindow(events: Project100WorkEvent[], timeZone: string) {
  if (events.length === 0) {
    return { label: "Ledig från jobb", detail: "Bra utrymme för ett längre pass.", tone: "open" };
  }
  const minutes = events.reduce(
    (total, event) =>
      total + Math.max(0, (new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) / 60000),
    0,
  );
  if (minutes >= 10 * 60) {
    return { label: "Tung arbetsdag", detail: "Kort rörelse eller återhämtning passar bäst.", tone: "rest" };
  }
  const firstStart = Math.min(...events.map((event) => minuteOfDayInTimeZone(event.startsAt, timeZone)));
  const lastEnd = Math.max(...events.map((event) => minuteOfDayInTimeZone(event.endsAt, timeZone)));
  if (firstStart >= 12 * 60) {
    return { label: "Fönster före jobbet", detail: "Morgonen rymmer ett fokuserat pass.", tone: "open" };
  }
  if (lastEnd <= 17 * 60) {
    return { label: "Fönster efter jobbet", detail: "Kvällen är fri för träning.", tone: "open" };
  }
  return { label: "Begränsat fönster", detail: "Planera kort och håll tröskeln låg.", tone: "short" };
}

export default async function Project100SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string | string[] }>;
}) {
  const actor = await requireProject100Actor();
  assertProject100Adult(actor);
  const query = await searchParams;
  const requestedWeek = typeof query.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.week)
    ? query.week
    : undefined;
  const schedule = await loadProject100WorkSchedule(actor, requestedWeek);
  const days = Array.from({ length: 7 }, (_, index) => addCalendarDateDays(schedule.weekStart, index));
  const previousWeek = addCalendarDateDays(schedule.weekStart, -7);
  const nextWeek = addCalendarDateDays(schedule.weekStart, 7);

  return (
    <>
      <header className="p100-page-head">
        <div><span>Arbete + återhämtning</span><h1>Din verkliga vecka</h1><p>Jobbschemat läses direkt från Vardagsros kalender. Projekt 100 ändrar aldrig arbetspassen här.</p></div>
        <div className="p100-head-actions">
          <Link className="p100-button-secondary" href={`/projekt-100/schema?week=${schedule.today}`}><RotateCcw /> Denna vecka</Link>
          <Link className="p100-button" href="/projekt-100/traning"><Dumbbell /> Planera träning</Link>
        </div>
      </header>

      <div className="p100-week-toolbar">
        <Link href={`/projekt-100/schema?week=${previousWeek}`} aria-label="Föregående vecka"><ChevronLeft /></Link>
        <div><small>Veckan som börjar</small><strong>{dateName.format(calendarDateValue(schedule.weekStart))}</strong></div>
        <Link href={`/projekt-100/schema?week=${nextWeek}`} aria-label="Nästa vecka"><ChevronRight /></Link>
      </div>

      <section className="p100-schedule-grid" aria-label="Jobbschema och möjliga träningsfönster">
        {days.map((date) => {
          const events = eventsOnDay(schedule.workEvents, date, schedule.timeZone);
          const window = trainingWindow(events, schedule.timeZone);
          const today = date === schedule.today;
          return (
            <article key={date} className={today ? "today" : ""}>
              <header><span>{dayName.format(calendarDateValue(date))}</span><strong>{dateName.format(calendarDateValue(date))}</strong>{today ? <small>Idag</small> : null}</header>
              <div className="p100-day-events">
                {events.length === 0 ? <div className="p100-no-work"><BriefcaseBusiness /><span><b>Inget jobb</b><small>Ingen arbetstid registrerad</small></span></div> : events.map((event) => <div className="p100-work-event" key={event.id}><BriefcaseBusiness /><span><b>{event.title}</b><small><Clock3 /> {formatTimeRange(event.startsAt, event.endsAt, event.allDay, schedule.timeZone)}</small>{event.location ? <small><MapPin /> {event.location}</small> : null}</span></div>)}
              </div>
              <div className={`p100-window p100-window-${window.tone}`}><Dumbbell /><span><b>{window.label}</b><small>{window.detail}</small></span></div>
            </article>
          );
        })}
      </section>

      <section className="p100-schedule-note"><BriefcaseBusiness /><div><strong>En kalender, två lager</strong><p>Arbetspassen ovan är read-only hushållsdata. Framtida träningsplaner blir privata Projekt 100-poster och blandas inte in i familjekalendern utan ditt uttryckliga val.</p></div></section>
    </>
  );
}

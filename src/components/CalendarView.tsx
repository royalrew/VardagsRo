"use client";

import { CalendarPlus, ChevronLeft, ChevronRight, Clock3, LayoutGrid, Pencil, SlidersHorizontal } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import {
  calendarHourRange,
  eventOccursOnCalendarDay,
  layoutTimedEvents,
  snapMinutesToQuarter,
  suggestEventMove,
  timedEventSegmentForCalendarDay,
} from "@/components/calendar-contracts";
import { Avatar, EmptyState, EventRow } from "@/components/ui";
import {
  calendarColumns,
  eventBelongsToColumn,
  familyScopePerson,
  personForEvent,
} from "@/lib/family-scope";
import {
  DEFAULT_TIME_ZONE,
  WEEKDAY_SHORT,
  addCalendarDateDays,
  calendarDateInTimeZone,
  calendarDayOfMonth,
  capitalize,
  formatCalendarMonthRange,
  formatClock,
  isoWeekNumberForCalendarDate,
  minuteOfDayInTimeZone,
  resolveCalendarTimeZone,
  startOfCalendarWeek,
} from "@/lib/dates";
import type { DashboardData, FamilyEvent, FamilyPerson } from "@/lib/types";

const DEFAULT_FIRST_HOUR = 6;
const DEFAULT_LAST_HOUR = 22;
const HOUR_HEIGHT = 58;


interface TimedDayEvent {
  event: FamilyEvent;
  startMinute: number;
  endMinute: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

interface DropTarget {
  dayKey: string;
  kind: "all-day" | "time";
  minute?: number;
}

function timedSegmentOnDay(
  event: FamilyEvent,
  calendarDate: string,
  timeZone: string,
): TimedDayEvent | null {
  const segment = timedEventSegmentForCalendarDay(event, calendarDate, timeZone);
  return segment ? { event, ...segment } : null;
}

function formatMinute(minute: number): string {
  const safeMinute = Math.max(0, Math.min(24 * 60, minute));
  const hours = Math.floor(safeMinute / 60);
  return `${String(hours).padStart(2, "0")}:${String(safeMinute % 60).padStart(2, "0")}`;
}

function sortEvents(events: FamilyEvent[]): FamilyEvent[] {
  return [...events].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.title.localeCompare(b.title, "sv");
  });
}

function AllDayEvent({
  event,
  person,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
  onEdit,
}: {
  event: FamilyEvent;
  person: FamilyPerson;
  dragging: boolean;
  onDragStart: (dragEvent: DragEvent, event: FamilyEvent) => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className={`calendar-all-day-event-wrap${dragging ? " is-dragging" : ""}`}
      draggable
      onDragStart={(dragEvent) => onDragStart(dragEvent, event)}
      onDragEnd={onDragEnd}
      title="Dra till en annan dag eller välj pennan för tangentbordsredigering"
    >
      <button
        className={`calendar-all-day-event calendar-event-${event.category}`}
        style={{ "--person-color": person.color } as CSSProperties}
        onClick={onOpen}
        aria-label={`${event.title}, hela dagen, ${person.name}`}
      >
        <span aria-hidden="true" />
        <strong>{event.title}</strong>
      </button>
      <button className="calendar-event-edit" onClick={onEdit} aria-label={`Redigera ${event.title}`} title="Redigera">
        <Pencil size={12} />
      </button>
    </div>
  );
}

export function CalendarView({
  data,
  onAddManual,
  onEventClick,
  onEditEvent,
}: {
  data: DashboardData;
  onAddManual: () => void;
  onEventClick: (event: FamilyEvent) => void;
  onEditEvent: (event: FamilyEvent, moveProposal?: boolean) => void;
}) {
  // The household owns the timezone, so a browser in another zone still sees the
  // family's days. resolveCalendarTimeZone falls back if the stored value is bad.
  const calendarTimeZone = resolveCalendarTimeZone(data.timezone || DEFAULT_TIME_ZONE);
  const [weekStart, setWeekStart] = useState(() =>
    startOfCalendarWeek(calendarDateInTimeZone(new Date(), calendarTimeZone)),
  );
  const family = useMemo(
    () => familyScopePerson(data.familyName, data.householdId),
    [data.familyName, data.householdId],
  );
  const columns = useMemo(() => calendarColumns(data.people), [data.people]);
  const [mode, setMode] = useState<"people" | "hours">("people");
  const [selectedPeople, setSelectedPeople] = useState<string[]>(() => [
    ...data.people.map((person) => person.id),
  ]);
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [now, setNow] = useState(() => new Date());
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addCalendarDateDays(weekStart, index)),
    [weekStart],
  );
  const todayDate = calendarDateInTimeZone(now, calendarTimeZone);
  const weekNumber = isoWeekNumberForCalendarDate(weekStart);
  const weekPeriodLabel = capitalize(formatCalendarMonthRange(days[0], days[6]));
  const visibleEvents = useMemo(
    () =>
      data.events.filter(
        (event) => event.personId === null || selectedPeople.includes(event.personId),
      ),
    [data.events, selectedPeople],
  );
  const eventsByDay = useMemo(() => {
    const index = new Map(days.map((day) => [day, [] as FamilyEvent[]]));
    for (const event of visibleEvents) {
      for (const day of days) {
        if (eventOccursOnCalendarDay(event, day, calendarTimeZone)) {
          index.get(day)!.push(event);
        }
      }
    }
    for (const [day, events] of index) index.set(day, sortEvents(events));
    return index;
  }, [days, visibleEvents, calendarTimeZone]);
  const peopleEventsByCell = useMemo(() => {
    const index = new Map<string, FamilyEvent[]>();
    if (mode !== "people") return index;
    for (const day of days) {
      const dayEvents = eventsByDay.get(day) ?? [];
      for (const person of columns) {
        const events = dayEvents.filter((event) => eventBelongsToColumn(event, person.id));
        if (events.length > 0) index.set(`${day}:${person.id}`, events);
      }
    }
    return index;
  }, [columns, days, eventsByDay, mode]);
  const draggedEvent = draggedEventId ? data.events.find((event) => event.id === draggedEventId) ?? null : null;

  const timedEventsByDay = useMemo(
    () => {
      if (mode !== "hours") return days.map(() => [] as TimedDayEvent[]);
      return days.map((day) =>
        (eventsByDay.get(day) ?? [])
          .map((event) => timedSegmentOnDay(event, day, calendarTimeZone))
          .filter((event): event is TimedDayEvent => event !== null),
      );
    },
    [days, eventsByDay, calendarTimeZone, mode],
  );
  const allDayEventsByDay = useMemo(
    () => {
      if (mode !== "hours") return days.map(() => [] as FamilyEvent[]);
      return days.map((day) => (eventsByDay.get(day) ?? []).filter((event) => event.allDay));
    },
    [days, eventsByDay, mode],
  );
  const { firstHour, lastHour } = useMemo(
    () => calendarHourRange(timedEventsByDay.flat(), DEFAULT_FIRST_HOUR, DEFAULT_LAST_HOUR),
    [timedEventsByDay],
  );
  const timelineHeight = (lastHour - firstHour) * HOUR_HEIGHT;
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);
  const weekHasEvents = days.some((day) => (eventsByDay.get(day)?.length ?? 0) > 0);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  function togglePerson(personId: string) {
    setSelectedPeople((current) =>
      current.includes(personId)
        ? current.length === 1
          ? current
          : current.filter((id) => id !== personId)
        : [...current, personId],
    );
  }

  function clearDrag() {
    setDraggedEventId(null);
    setDropTarget(null);
  }

  function startDrag(dragEvent: DragEvent, calendarEvent: FamilyEvent) {
    setDraggedEventId(calendarEvent.id);
    dragEvent.dataTransfer.effectAllowed = "move";
    dragEvent.dataTransfer.setData("text/plain", calendarEvent.id);
  }

  function eventFromDrop(dragEvent: DragEvent): FamilyEvent | null {
    const eventId = dragEvent.dataTransfer.getData("text/plain") || draggedEventId;
    return data.events.find((event) => event.id === eventId) ?? null;
  }

  function dropAllDay(dragEvent: DragEvent, day: string) {
    dragEvent.preventDefault();
    const calendarEvent = eventFromDrop(dragEvent);
    clearDrag();
    if (!calendarEvent?.allDay) return;
    onEditEvent(suggestEventMove(calendarEvent, day, undefined, calendarTimeZone), true);
  }

  function minuteAtPointer(dragEvent: DragEvent<HTMLElement>): number {
    const bounds = dragEvent.currentTarget.getBoundingClientRect();
    const minute = firstHour * 60 + ((dragEvent.clientY - bounds.top) / bounds.height) * (lastHour - firstHour) * 60;
    return snapMinutesToQuarter(minute);
  }

  function dropAtTime(dragEvent: DragEvent<HTMLElement>, day: string) {
    dragEvent.preventDefault();
    const calendarEvent = eventFromDrop(dragEvent);
    const targetMinute = minuteAtPointer(dragEvent);
    clearDrag();
    if (!calendarEvent || calendarEvent.allDay) return;
    onEditEvent(suggestEventMove(calendarEvent, day, targetMinute, calendarTimeZone), true);
  }

  return (
    <div className="calendar-view view-enter">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Familjens gemensamma tid</p>
          <h1>Kalender</h1>
          <p>Planera veckan på timmen och se vem som gör vad.</p>
        </div>
        <button className="button button-primary" onClick={onAddManual}>
          <CalendarPlus size={18} /> Ny kalenderpost
        </button>
      </section>

      <section className="calendar-toolbar card">
        <div className="week-switcher">
          <button className="icon-button" onClick={() => setWeekStart(addCalendarDateDays(weekStart, -7))} aria-label="Föregående vecka">
            <ChevronLeft size={20} />
          </button>
          <button className="today-button" onClick={() => setWeekStart(startOfCalendarWeek(calendarDateInTimeZone(new Date(), calendarTimeZone)))}>
            Idag
          </button>
          <button className="icon-button" onClick={() => setWeekStart(addCalendarDateDays(weekStart, 7))} aria-label="Nästa vecka">
            <ChevronRight size={20} />
          </button>
          <div className="calendar-period-title">
            <h2>{weekPeriodLabel}</h2>
            <span>Vecka {weekNumber}</span>
          </div>
        </div>
        <div className="calendar-mode-switch" role="group" aria-label="Kalendervy">
          <button
            type="button"
            className={mode === "people" ? "calendar-mode active" : "calendar-mode"}
            onClick={() => setMode("people")}
            aria-pressed={mode === "people"}
          >
            <LayoutGrid size={16} /> Vem gör vad
          </button>
          <button
            type="button"
            className={mode === "hours" ? "calendar-mode active" : "calendar-mode"}
            onClick={() => setMode("hours")}
            aria-pressed={mode === "hours"}
          >
            <Clock3 size={16} /> Tider
          </button>
        </div>
        <div className="people-filters" aria-label="Filtrera familjemedlemmar">
          <SlidersHorizontal size={17} aria-hidden="true" />
          {columns.map((person) => {
            const active = selectedPeople.includes(person.id);
            return (
              <button
                key={person.id}
                className={active ? "person-filter active" : "person-filter"}
                onClick={() => togglePerson(person.id)}
                aria-pressed={active}
              >
                <span style={{ background: person.color }} aria-hidden="true" />
                {person.name}
              </button>
            );
          })}
        </div>
      </section>

      <p className="calendar-drag-hint">
        <Clock3 size={13} aria-hidden="true" /> Dra en tid till önskad dag och kvart. Förslaget öppnas alltid för kontroll innan du sparar.
        Du kan också välja pennan och ändra med tangentbord.
      </p>

      {mode === "people" ? (
        <section className="people-board card" aria-label={`Vem gör vad, vecka ${weekNumber}`}>
          <div className="people-board-scroll">
            <div
              className="people-grid"
              style={{ "--column-count": columns.length } as CSSProperties}
            >
              <div className="people-grid-corner" aria-hidden="true">
                <span>Vecka</span>
                <strong>{weekNumber}</strong>
              </div>
              {columns.map((person) => (
                <div className="people-grid-head" key={`head-${person.id}`}>
                  <Avatar person={person} size="small" />
                  <span>
                    <strong>{person.name}</strong>
                    <small>{person.role}</small>
                  </span>
                </div>
              ))}

              {days.map((day, dayIndex) => {
                const today = day === todayDate;
                return (
                  <Fragment key={`row-${day}`}>
                    <div className={`people-grid-day${today ? " is-today" : ""}`}>
                      <span>{WEEKDAY_SHORT[dayIndex]}</span>
                      <strong>{calendarDayOfMonth(day)}</strong>
                      {today ? <small>Idag</small> : null}
                    </div>
                    {columns.map((person) => {
                      const cellEvents = peopleEventsByCell.get(`${day}:${person.id}`) ?? [];
                      return (
                        <div
                          className={`people-grid-cell${today ? " is-today" : ""}`}
                          key={`cell-${day}-${person.id}`}
                        >
                          {cellEvents.map((calendarEvent) => (
                            <button
                              key={calendarEvent.id}
                              className={`people-chip calendar-event-${calendarEvent.category}`}
                              style={{ "--person-color": person.color } as CSSProperties}
                              onClick={() => onEventClick(calendarEvent)}
                              title={`${calendarEvent.title} — ${person.name}`}
                            >
                              <span className="people-chip-time">
                                {calendarEvent.allDay
                                  ? "Hela dagen"
                                  : `${formatClock(calendarEvent.startsAt, calendarTimeZone)}–${formatClock(calendarEvent.endsAt, calendarTimeZone)}`}
                              </span>
                              <strong>{calendarEvent.title}</strong>
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </Fragment>
                );
              })}
            </div>
          </div>
          {!weekHasEvents ? (
            <EmptyState
              title="Inga tider den här veckan"
              text="Lägg till en kalenderpost eller välj en annan vecka."
            />
          ) : null}
        </section>
      ) : null}

      <section
        className="week-board card"
        aria-label={`Veckokalender, vecka ${weekNumber}`}
        hidden={mode !== "hours"}
      >
        <div className="calendar-week-shell">
          <div className="calendar-week-grid">
            <div className="calendar-week-corner" aria-hidden="true">
              <span>Vecka</span>
              <strong>{weekNumber}</strong>
            </div>
            {days.map((day, index) => {
              const today = day === todayDate;
              return (
                <header className={`calendar-day-header${today ? " is-today" : ""}`} key={`header-${day}`}>
                  <span>{WEEKDAY_SHORT[index]}</span>
                  <strong>{calendarDayOfMonth(day)}</strong>
                  {today ? <small>Idag</small> : null}
                </header>
              );
            })}

            <div className="calendar-all-day-label">Hela dagen</div>
            {days.map((day, dayIndex) => {
              const dayKey = day;
              const activeDrop = dropTarget?.kind === "all-day" && dropTarget.dayKey === dayKey;
              return (
                <div
                  className={`calendar-all-day-cell${activeDrop ? " is-drop-target" : ""}`}
                  key={`all-day-${dayKey}`}
                  onDragOver={(dragEvent) => {
                    if (!draggedEvent?.allDay) return;
                    dragEvent.preventDefault();
                    dragEvent.dataTransfer.dropEffect = "move";
                    setDropTarget({ dayKey, kind: "all-day" });
                  }}
                  onDrop={(dragEvent) => dropAllDay(dragEvent, day)}
                  aria-label={`${WEEKDAY_SHORT[dayIndex]}, heldagshändelser`}
                >
                  {allDayEventsByDay[dayIndex].map((calendarEvent) => {
                    const person = personForEvent(data.people, calendarEvent, family);
                    return (
                      <AllDayEvent
                        key={calendarEvent.id}
                        event={calendarEvent}
                        person={person}
                        dragging={draggedEventId === calendarEvent.id}
                        onDragStart={startDrag}
                        onDragEnd={clearDrag}
                        onOpen={() => onEventClick(calendarEvent)}
                        onEdit={() => onEditEvent(calendarEvent)}
                      />
                    );
                  })}
                </div>
              );
            })}

            <div className="calendar-time-axis" style={{ height: timelineHeight }} aria-hidden="true">
              {hours.map((hour) => (
                <span className="calendar-time-label" key={hour} style={{ top: (hour - firstHour) * HOUR_HEIGHT }}>
                  {String(hour).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {days.map((day, dayIndex) => {
              const dayKey = day;
              const today = day === todayDate;
              const activeDrop = dropTarget?.kind === "time" && dropTarget.dayKey === dayKey;
              const layouts = layoutTimedEvents(
                timedEventsByDay[dayIndex].map((item) => ({ id: item.event.id, startMinute: item.startMinute, endMinute: item.endMinute })),
              );
              const nowMinute = minuteOfDayInTimeZone(now, calendarTimeZone);
              const showNow = today && nowMinute >= firstHour * 60 && nowMinute <= lastHour * 60;
              return (
                <div
                  className={`calendar-time-column${today ? " is-today" : ""}${activeDrop ? " is-drop-target" : ""}`}
                  style={{ height: timelineHeight, "--hour-height": `${HOUR_HEIGHT}px` } as CSSProperties}
                  key={`time-${dayKey}`}
                  onDragOver={(dragEvent) => {
                    if (!draggedEvent || draggedEvent.allDay) return;
                    dragEvent.preventDefault();
                    dragEvent.dataTransfer.dropEffect = "move";
                    setDropTarget({ dayKey, kind: "time", minute: minuteAtPointer(dragEvent) });
                  }}
                  onDrop={(dragEvent) => dropAtTime(dragEvent, day)}
                  aria-label={`${WEEKDAY_SHORT[dayIndex]}, tider ${formatMinute(firstHour * 60)} till ${formatMinute(lastHour * 60)}`}
                >
                  {layouts.map((layout) => {
                    const segment = timedEventsByDay[dayIndex].find((item) => item.event.id === layout.id);
                    if (!segment) return null;
                    const person = personForEvent(data.people, segment.event, family);
                    const top = ((layout.startMinute - firstHour * 60) / 60) * HOUR_HEIGHT;
                    const visualHeight = Math.max(24, ((layout.endMinute - layout.startMinute) / 60) * HOUR_HEIGHT - 2);
                    const columnWidth = 100 / layout.columnCount;
                    const left = layout.column * columnWidth;
                    const short = visualHeight < 49;
                    return (
                      <div
                        className={`calendar-timed-event-wrap${short ? " is-short" : ""}${draggedEventId === segment.event.id ? " is-dragging" : ""}`}
                        style={{
                          top,
                          height: visualHeight,
                          left: `calc(${left}% + 2px)`,
                          width: `calc(${columnWidth}% - 4px)`,
                          "--person-color": person.color,
                        } as CSSProperties}
                        draggable
                        onDragStart={(dragEvent) => startDrag(dragEvent, segment.event)}
                        onDragEnd={clearDrag}
                        key={segment.event.id}
                        title="Dra till en ny kvart eller välj pennan för tangentbordsredigering"
                      >
                        <button
                          className={`calendar-timed-event calendar-event-${segment.event.category}`}
                          onClick={() => onEventClick(segment.event)}
                          aria-label={`${segment.event.title}, ${formatClock(segment.event.startsAt)} till ${formatClock(segment.event.endsAt)}, ${person.name}`}
                        >
                          <span className="calendar-event-time">
                            {segment.continuesBefore ? "← " : ""}{formatClock(segment.event.startsAt)}–{formatClock(segment.event.endsAt)}{segment.continuesAfter ? " →" : ""}
                          </span>
                          <strong>{segment.event.title}</strong>
                          {!short ? <span className="calendar-person"><Avatar person={person} size="small" /> {person.name}</span> : null}
                        </button>
                        <button
                          className="calendar-event-edit"
                          onClick={() => onEditEvent(segment.event)}
                          aria-label={`Redigera ${segment.event.title}`}
                          title="Redigera"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    );
                  })}
                  {showNow ? (
                    <div
                      className="calendar-now-line"
                      style={{ top: ((nowMinute - firstHour * 60) / 60) * HOUR_HEIGHT }}
                      aria-label={`Nu, ${formatMinute(nowMinute)}`}
                    >
                      <span />
                    </div>
                  ) : null}
                  {activeDrop && dropTarget.minute !== undefined ? (
                    <div
                      className="calendar-drop-preview"
                      style={{ top: ((dropTarget.minute - firstHour * 60) / 60) * HOUR_HEIGHT }}
                      aria-hidden="true"
                    >
                      <span>{formatMinute(dropTarget.minute)}</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mobile-agenda card" aria-label={`Agenda för vecka ${weekNumber}`}>
        <div className="mobile-agenda-heading">
          <strong>Vecka {weekNumber}</strong>
          <span>{weekPeriodLabel}</span>
        </div>
        {days.map((day, index) => {
          const events = eventsByDay.get(day) ?? [];
          if (!events.length) return null;
          return (
            <div className="agenda-day" key={day}>
              <h3>
                {WEEKDAY_SHORT[index]} <span>{calendarDayOfMonth(day)}</span>
              </h3>
              <div className="agenda-day-events">
                {events.map((calendarEvent) => {
                  const person = personForEvent(data.people, calendarEvent, family);
                  return (
                    <div className="agenda-event-editable" key={calendarEvent.id}>
                      <EventRow event={calendarEvent} person={person} onClick={() => onEventClick(calendarEvent)} />
                      <button className="agenda-edit-button" onClick={() => onEditEvent(calendarEvent)} aria-label={`Redigera ${calendarEvent.title}`}>
                        <Pencil size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!weekHasEvents ? <EmptyState title="Inga tider den här veckan" text="Lägg till en kalenderpost eller välj en annan vecka." /> : null}
      </section>
    </div>
  );
}

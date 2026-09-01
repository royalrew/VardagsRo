"use client";

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Plus,
  ScanLine,
  Send,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { capitalize, formatClock, formatLongDate, formatTimeRange, isSameLocalDay } from "@/lib/dates";
import { eventConcernsPerson, familyScopePerson, personForEvent } from "@/lib/family-scope";
import type { DashboardData, FamilyEvent, FamilyTask } from "@/lib/types";
import { Avatar, EmptyState, EventRow } from "@/components/ui";
import { KidsChoresNotice } from "@/components/KidsChoresNotice";
import { TaskBoard } from "@/components/TaskBoard";

export function HomeView({
  data,
  onAsk,
  onAdd,
  onNavigate,
  onEventClick,
  onToggleTask,
  onOpenDocument,
  onOpenAddChore,
}: {
  data: DashboardData;
  onAsk: (question: string) => void;
  onAdd: () => void;
  onNavigate: (view: "calendar" | "documents") => void;
  onEventClick: (event: FamilyEvent) => void;
  onToggleTask: (task: FamilyTask, completed: boolean) => Promise<boolean>;
  onOpenDocument: (documentId: string) => void;
  onOpenAddChore?: () => void;
}) {
  const [question, setQuestion] = useState("");
  const now = useMemo(() => new Date(), []);
  const todayEvents = useMemo(
    () =>
      data.events
        .filter((event) => isSameLocalDay(event.startsAt, now))
        .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)),
    [data.events, now],
  );
  const upcoming = useMemo(() => {
    const floor = new Date(now);
    floor.setHours(0, 0, 0, 0);
    return data.events
      .filter((event) => new Date(event.endsAt) >= floor && !isSameLocalDay(event.startsAt, now))
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
      .slice(0, 4);
  }, [data.events, now]);
  const reviewDocuments = data.documents.filter((document) => document.status === "needs_review");
  const currentPerson = data.people.find((person) => person.id === data.currentPersonId) ?? data.people[0];
  const isChild = currentPerson?.personType === "child";

  function submitQuestion(event: React.FormEvent) {
    event.preventDefault();
    const value = question.trim();
    if (!value) return;
    onAsk(value);
  }

  const suggestionChips = isChild
    ? ["Vad händer idag?", "Vad ska jag städa?", "När slutar mamma/pappa jobbet?"]
    : ["Vad händer i helgen?", "Jobbar pappa på söndag?", "Vad behöver kollas?"];

  return (
    <div className="home-view view-enter">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">{capitalize(formatLongDate(now))}</p>
          <h1>Hej, {currentPerson?.name}!</h1>
          <p className="welcome-subtitle">
            {isChild
              ? "Här ser du vad som händer idag och dina uppgifter ⭐"
              : "Här är familjens dag, samlad och klar."}
          </p>
        </div>
        {!isChild && (
          <button className="button button-primary desktop-add" onClick={onAdd}>
            <Plus size={18} aria-hidden="true" /> Lägg till
          </button>
        )}
      </section>

      <KidsChoresNotice
        currentPerson={currentPerson}
        people={data.people}
        tasks={data.tasks}
        onToggleTask={onToggleTask}
        onOpenAddChore={onOpenAddChore ?? onAdd}
      />

      <section className="ask-hero" aria-labelledby="ask-heading">
        <div className="ask-orb" aria-hidden="true">
          <Sparkles size={23} />
        </div>
        <div className="ask-copy">
          <span className="ask-label">Fråga Vardagsro</span>
          <h2 id="ask-heading">Vad vill du veta?</h2>
          <p>Jag letar bara i det som familjen har lagt in.</p>
        </div>
        <form className="ask-inline" onSubmit={submitQuestion}>
          <label className="sr-only" htmlFor="home-question">
            Fråga om familjens planer
          </label>
          <input
            id="home-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={
              isChild
                ? "När kommer pappa hem?"
                : "Jobbar pappa på söndag när jag har fotboll?"
            }
          />
          <button type="submit" aria-label="Skicka frågan" disabled={!question.trim()}>
            <Send size={18} />
          </button>
        </form>
        <div className="question-chips" aria-label="Förslag på frågor">
          {suggestionChips.map((suggestion) => (
            <button key={suggestion} onClick={() => onAsk(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      </section>

      <div className="home-grid">
        <section className="card today-card">
          <header className="section-header">
            <div>
              <span className="section-kicker">Idag</span>
              <h2>{todayEvents.length ? `${todayEvents.length} saker på gång` : "En lugn dag"}</h2>
            </div>
            <button className="text-button" onClick={() => onNavigate("calendar")}>
              Hela veckan <ChevronRight size={16} />
            </button>
          </header>

          {todayEvents.length ? (
            <div className="today-timeline">
              {todayEvents.map((event, index) => {
                const person = personForEvent(data.people, event, familyScopePerson(data.familyName, data.householdId));
                return (
                  <div className="timeline-item" key={event.id}>
                    <time>
                      {event.allDay
                        ? "Hela dagen"
                        : `${formatClock(event.startsAt)}–${formatClock(event.endsAt)}`}
                    </time>
                    <span className="timeline-track" aria-hidden="true">
                      <i style={{ background: person.color }} />
                      {index < todayEvents.length - 1 ? <b /> : null}
                    </span>
                    <button className="timeline-content" onClick={() => onEventClick(event)}>
                      <span>
                        <strong>{event.title}</strong>
                        <small>{event.location ? `${event.location} · ${person.name}` : person.name}</small>
                      </span>
                      <Avatar person={person} size="small" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="Inget inlagt idag"
              text="När familjen lägger till tider syns de här."
              action={
                !isChild ? (
                  <button className="button button-soft" onClick={onAdd}>
                    <Plus size={16} /> Lägg till något
                  </button>
                ) : undefined
              }
            />
          )}
        </section>

        <aside className="card family-card">
          <header className="section-header compact-header">
            <div>
              <span className="section-kicker">Familjen idag</span>
              <h2>Alla på ett ställe</h2>
            </div>
          </header>
          <div className="family-list">
            {data.people.map((person) => {
              const next = todayEvents.find((event) => eventConcernsPerson(event, person.id));
              return (
                <div className="family-row" key={person.id}>
                  <Avatar person={person} showStatus />
                  <span>
                    <strong>{person.name}</strong>
                    <small>
                      {next
                        ? `${formatTimeRange(next.startsAt, next.endsAt, next.allDay)} · ${next.title}`
                        : "Inget inlagt idag"}
                    </small>
                  </span>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      <TaskBoard
        tasks={data.tasks}
        people={data.people}
        documents={data.documents}
        currentPerson={currentPerson}
        onToggle={onToggleTask}
        onOpenDocument={onOpenDocument}
      />

      <div className="home-bottom-grid">
        <section className="card soon-card">
          <header className="section-header compact-header">
            <div>
              <span className="section-kicker">Snart</span>
              <h2>Resten av veckan</h2>
            </div>
            <CalendarDays size={20} aria-hidden="true" />
          </header>
          <div className="event-list">
            {upcoming.map((event) => {
              const person = personForEvent(data.people, event, familyScopePerson(data.familyName, data.householdId));
              return (
                <div className="dated-event" key={event.id}>
                  <span className="date-pill">
                    {new Intl.DateTimeFormat("sv-SE", { weekday: "short" }).format(
                      new Date(event.startsAt),
                    )}
                    <b>{new Date(event.startsAt).getDate()}</b>
                  </span>
                  <EventRow event={event} person={person} compact onClick={() => onEventClick(event)} />
                </div>
              );
            })}
          </div>
        </section>

        {!isChild && (
          <section className="card review-card">
            <header className="section-header compact-header">
              <div>
                <span className="section-kicker">Behöver kollas</span>
                <h2>{reviewDocuments.length ? "Hjälp oss kontrollera" : "Allt ser bra ut"}</h2>
              </div>
              {reviewDocuments.length ? (
                <span className="count-badge">{reviewDocuments.length}</span>
              ) : (
                <CheckCircle2 size={22} className="success-icon" aria-hidden="true" />
              )}
            </header>

            {reviewDocuments.length ? (
              <button className="review-document" onClick={() => onNavigate("documents")}>
                <span className="document-mini-icon">
                  <ScanLine size={20} />
                </span>
                <span>
                  <strong>{reviewDocuments[0].title}</strong>
                  <small>{reviewDocuments[0].summary}</small>
                </span>
                <CircleAlert size={18} className="warning-icon" />
              </button>
            ) : (
              <p className="calm-copy">Alla uppladdade tider är kontrollerade.</p>
            )}

            <button className="card-link" onClick={() => onNavigate("documents")}>
              Visa dokument <ArrowRight size={16} />
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

"use client";

import { CalendarPlus, Clock3, MapPin, StickyNote, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  eventFormDateTimeValues,
  eventIntervalFromForm,
  eventWriteInput,
  savedEventFromResponse,
} from "@/components/calendar-contracts";
import { FAMILY_SCOPE_ID } from "@/lib/family-scope";
import type { EventCategory, FamilyEvent, FamilyPerson } from "@/lib/types";

function tomorrowAtFive(): Date {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  value.setHours(17, 0, 0, 0);
  return value;
}

export function ManualEventModal({
  open,
  people,
  householdId,
  allowLocalDemo,
  event: existingEvent = null,
  moveProposal = false,
  onClose,
  onSaved,
}: {
  open: boolean;
  people: FamilyPerson[];
  householdId: string;
  allowLocalDemo: boolean;
  event?: FamilyEvent | null;
  moveProposal?: boolean;
  onClose: () => void;
  onSaved: (event: FamilyEvent) => void;
}) {
  const initialStart = existingEvent ? new Date(existingEvent.startsAt) : tomorrowAtFive();
  const initialEnd = existingEvent
    ? new Date(existingEvent.endsAt)
    : new Date(initialStart.getTime() + 60 * 60_000);
  const initialFormValues = eventFormDateTimeValues(initialStart, initialEnd);
  const [title, setTitle] = useState(existingEvent?.title ?? "");
  // FAMILY_SCOPE_ID in the select means the event concerns everyone and is
  // stored with no person at all.
  const [personId, setPersonId] = useState<string>(
    existingEvent ? existingEvent.personId ?? FAMILY_SCOPE_ID : people[0]?.id ?? FAMILY_SCOPE_ID,
  );
  const [category, setCategory] = useState<EventCategory>(existingEvent?.category ?? "family");
  const [date, setDate] = useState(initialFormValues.date);
  const [allDayEndDate, setAllDayEndDate] = useState(initialFormValues.allDayEndDate);
  const [startTime, setStartTime] = useState(initialFormValues.startTime);
  const [endTime, setEndTime] = useState(initialFormValues.endTime);
  const [allDay, setAllDay] = useState(existingEvent?.allDay ?? false);
  const [location, setLocation] = useState(existingEvent?.location ?? "");
  const [notes, setNotes] = useState(existingEvent?.notes ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [open, onClose, saving]);

  if (!open) return null;

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Skriv vad som händer.");
      return;
    }
    if (personId !== FAMILY_SCOPE_ID && !people.some((person) => person.id === personId)) {
      setError("Välj en familjemedlem.");
      return;
    }

    const interval = eventIntervalFromForm(date, startTime, endTime, allDay, allDayEndDate);
    if (!interval) {
      setError(
        allDay
          ? "Slutdatumet måste vara efter startdatumet."
          : "Kontrollera datum och tid. Start och slut får inte vara samma tid.",
      );
      return;
    }
    const { startsAt, endsAt } = interval;

    const draft: FamilyEvent = {
      id: existingEvent?.id ?? crypto.randomUUID(),
      householdId,
      personId: personId === FAMILY_SCOPE_ID ? null : personId,
      documentId: null,
      title: title.trim(),
      category,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      allDay,
      location: location.trim() || null,
      notes: notes.trim() || null,
      status: "confirmed",
      confidence: 1,
      sourceExcerpt: null,
    };

    setSaving(true);
    try {
      const response = await fetch(existingEvent ? `/api/events/${existingEvent.id}` : "/api/events", {
        method: existingEvent ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventWriteInput(draft)),
      });
      const payload: unknown = await response.json().catch(() => null);
      const saved = savedEventFromResponse(payload, existingEvent?.id);
      if (!response.ok || !saved) throw new Error("save failed");
      onSaved(saved);
      onClose();
    } catch {
      if (allowLocalDemo) {
        onSaved(draft);
        onClose();
      } else {
        setError("Kalenderposten kunde inte sparas. Försök igen.");
      }
    } finally {
      setSaving(false);
    }
  }

  const editing = existingEvent !== null;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section className="modal-panel manual-modal" role="dialog" aria-modal="true" aria-labelledby="manual-title">
        <header className="modal-header">
          <span className="modal-title-icon">
            <CalendarPlus size={21} />
          </span>
          <div>
            <p className="eyebrow">{moveProposal ? "Föreslagen flytt" : editing ? "Ändra uppgifter" : "Skriv in själv"}</p>
            <h2 id="manual-title">{editing ? "Redigera kalenderpost" : "Ny kalenderpost"}</h2>
          </div>
          <button className="icon-button modal-close" onClick={onClose} disabled={saving} aria-label="Stäng">
            <X size={20} />
          </button>
        </header>

        <form className="manual-form" onSubmit={submit}>
          {moveProposal ? (
            <p className="move-proposal-note field-full" role="status">
              Inget har ändrats ännu. Kontrollera den föreslagna dagen och tiden och välj Spara eller Avbryt.
            </p>
          ) : null}
          {existingEvent?.documentId ? (
            <p className="source-detach-note field-full" role="status">
              När du sparar blir detta familjens manuella version. Kopplingen till originaldokumentet tas bort så att AI:n inte hänvisar till en gammal tid.
            </p>
          ) : null}
          <label className="field field-full">
            <span>Vad händer?</span>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Till exempel fotbollsträning" disabled={saving} />
          </label>
          <label className="field">
            <span>Vem gäller det?</span>
            <select value={personId} onChange={(e) => setPersonId(e.target.value)} disabled={saving}>
              <option value={FAMILY_SCOPE_ID}>Hela familjen</option>
              {people.map((person) => (
                <option value={person.id} key={person.id}>
                  {person.name} · {person.role}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Typ</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as EventCategory)} disabled={saving}>
              <option value="family">Familj</option>
              <option value="work">Jobb</option>
              <option value="school">Skola</option>
              <option value="sport">Fritid</option>
              <option value="health">Hälsa</option>
              <option value="other">Övrigt</option>
            </select>
          </label>
          <label className="field field-full field-with-icon">
            <span>{allDay ? "Startdatum" : "Datum"}</span>
            <CalendarPlus size={16} />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required disabled={saving} />
          </label>
          <label className="all-day-control field-full">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} disabled={saving} />
            <span>Hela dagen</span>
          </label>
          {allDay ? (
            <label className="field field-full field-with-icon">
              <span>Slutdatum <small>dagen efter sista dagen</small></span>
              <CalendarPlus size={16} />
              <input
                type="date"
                value={allDayEndDate}
                min={date}
                onChange={(e) => setAllDayEndDate(e.target.value)}
                required
                disabled={saving}
              />
            </label>
          ) : null}
          <label className="field field-with-icon">
            <span>Start</span>
            <Clock3 size={16} />
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required={!allDay} disabled={saving || allDay} />
          </label>
          <label className="field field-with-icon">
            <span>Slut</span>
            <Clock3 size={16} />
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required={!allDay} disabled={saving || allDay} />
          </label>
          <label className="field field-full field-with-icon">
            <span>Plats <small>valfritt</small></span>
            <MapPin size={16} />
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Var händer det?" disabled={saving} />
          </label>
          <label className="field field-full field-with-icon field-textarea">
            <span>Anteckning <small>valfritt</small></span>
            <StickyNote size={16} />
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Till exempel vad ni behöver ta med" maxLength={2000} disabled={saving} />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <footer className="modal-actions field-full">
            <button type="button" className="button button-ghost" onClick={onClose} disabled={saving}>
              Avbryt
            </button>
            <button type="submit" className="button button-primary" disabled={saving}>
              {saving ? "Sparar…" : editing ? "Spara ändringar" : "Spara i kalendern"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

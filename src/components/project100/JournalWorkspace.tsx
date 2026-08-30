"use client";

import {
  BookOpen,
  Camera,
  Check,
  Dumbbell,
  EyeOff,
  Lock,
  PenLine,
  Ruler,
  Search,
  Sparkles,
  Trash2,
  Utensils,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  journalExcerpt,
  journalWordCount,
  PROJECT100_ENERGY_LABELS,
  PROJECT100_MOOD_LABELS,
  promptForDay,
  type Project100JournalEntry,
  type Project100JournalView,
} from "@/lib/project100-journal";
import {
  PROJECT100_TIMELINE_LABELS,
  type Project100TimelineDay,
  type Project100TimelineKind,
} from "@/lib/project100-timeline";

interface Draft {
  writtenOn: string;
  body: string;
  mood: number | null;
  energy: number | null;
  sleepHours: string;
  excludedFromAi: boolean;
}

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string };

const dayFormatter = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" });
const longFormatter = new Intl.DateTimeFormat("sv-SE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const clockFormatter = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" });

function minuteOfDay(value: number): string {
  const hours = Math.floor(value / 60).toString().padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

const TIMELINE_ICONS: Record<Project100TimelineKind, typeof BookOpen> = {
  journal: PenLine,
  training: Dumbbell,
  meal: Utensils,
  body: Ruler,
  media: Camera,
};

function draftFrom(entry: Project100JournalEntry | null, day: string): Draft {
  return {
    writtenOn: entry?.writtenOn ?? day,
    body: entry?.body ?? "",
    mood: entry?.mood ?? null,
    energy: entry?.energy ?? null,
    sleepHours: entry?.sleepHours?.toString() ?? "",
    excludedFromAi: entry?.excludedFromAi ?? false,
  };
}

async function failureFrom(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    details?: string;
  } | null;
  return new Error(body?.details ?? body?.error ?? fallback);
}

function Scale({
  legend,
  labels,
  value,
  onChange,
}: {
  legend: string;
  labels: Record<number, string>;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <fieldset className="p100-journal-scale">
      <legend>{legend}</legend>
      <div>
        {[1, 2, 3, 4, 5].map((step) => (
          <button
            type="button"
            key={step}
            className={value === step ? "active" : ""}
            aria-pressed={value === step}
            title={labels[step]}
            onClick={() => onChange(value === step ? null : step)}
          >
            <b>{step}</b>
            <small>{labels[step]}</small>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function JournalWorkspace({
  view,
  timeline,
  selected,
  selectedDay,
}: {
  view: Project100JournalView;
  timeline: Project100TimelineDay[];
  selected: Project100JournalEntry | null;
  selectedDay: string;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(view.entries);
  const [draft, setDraft] = useState(() => draftFrom(selected, selectedDay));
  const [loadedDay, setLoadedDay] = useState(selectedDay);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(view.query ?? "");
  const [showPrompt, setShowPrompt] = useState(false);
  const [revealSensitive, setRevealSensitive] = useState(false);

  // Navigating to another day loads that day into the writing area.
  if (loadedDay !== selectedDay) {
    setLoadedDay(selectedDay);
    setDraft(draftFrom(selected, selectedDay));
    setSave({ kind: "idle" });
    setError(null);
  }

  const words = journalWordCount(draft.body);
  const isEmpty =
    draft.body.trim() === "" &&
    draft.mood === null &&
    draft.energy === null &&
    draft.sleepHours.trim() === "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSave({ kind: "saving" });
    setError(null);
    try {
      const sleep = draft.sleepHours.trim().replace(",", ".");
      const sleepHours = sleep === "" ? null : Number(sleep);
      if (sleepHours !== null && (!Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 24)) {
        throw new Error("Sömn anges i timmar mellan 0 och 24.");
      }

      const response = await fetch("/api/project100/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          writtenOn: draft.writtenOn,
          body: draft.body.trim() || null,
          mood: draft.mood,
          energy: draft.energy,
          sleepHours,
          excludedFromAi: draft.excludedFromAi,
        }),
      });
      if (!response.ok) throw await failureFrom(response, "Anteckningen kunde inte sparas.");
      const saved = (await response.json()) as { entry: Project100JournalEntry };
      setEntries((current) => [
        saved.entry,
        ...current.filter((item) => item.writtenOn !== saved.entry.writtenOn),
      ]);
      setSave({ kind: "saved", at: clockFormatter.format(new Date()) });
      router.refresh();
    } catch (caught) {
      setSave({ kind: "idle" });
      setError(caught instanceof Error ? caught.message : "Något gick fel.");
    }
  }

  async function remove(entry: Project100JournalEntry) {
    if (!window.confirm(`Ta bort anteckningen från ${longFormatter.format(new Date(`${entry.writtenOn}T12:00:00`))}?`)) {
      return;
    }
    const response = await fetch(`/api/project100/journal/${entry.writtenOn}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      window.alert((await failureFrom(response, "Anteckningen kunde inte tas bort.")).message);
      return;
    }
    setEntries((current) => current.filter((item) => item.writtenOn !== entry.writtenOn));
    if (entry.writtenOn === draft.writtenOn) setDraft(draftFrom(null, draft.writtenOn));
    router.refresh();
  }

  return (
    <div className="p100-journal-workspace">
      <header className="p100-page-head">
        <div>
          <span>Reflektera</span>
          <h1>Dagbok</h1>
          <p>
            En lugn yta för kroppen, huvudet och det du vill minnas. Det du skriver här
            stannar här — och du bestämmer själv vad Jarvis får läsa.
          </p>
        </div>
        <div className="p100-head-actions">
          <span className="p100-journal-privacy-count">
            <Lock /> {view.excludedCount} undantagna
          </span>
        </div>
      </header>

      <form className="p100-journal-desk" onSubmit={submit}>
        <header>
          <div>
            <input
              type="date"
              value={draft.writtenOn}
              max={view.today}
              aria-label="Datum"
              onChange={(event) => setDraft({ ...draft, writtenOn: event.target.value })}
            />
            <strong>{longFormatter.format(new Date(`${draft.writtenOn}T12:00:00`))}</strong>
          </div>
          <div className="p100-journal-desk-status">
            {save.kind === "saving" ? <span>Sparar…</span> : null}
            {save.kind === "saved" ? (
              <span className="saved">
                <Check /> Sparat {save.at}
              </span>
            ) : null}
            {words > 0 ? <small>{words} ord</small> : null}
          </div>
        </header>

        <textarea
          value={draft.body}
          rows={9}
          maxLength={20000}
          placeholder="Skriv fritt. Ingen annan läser det här."
          onChange={(event) => setDraft({ ...draft, body: event.target.value })}
        />

        <div className="p100-journal-prompt">
          {showPrompt ? (
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  body: draft.body
                    ? `${draft.body.trimEnd()}\n\n${promptForDay(draft.writtenOn)}\n`
                    : `${promptForDay(draft.writtenOn)}\n`,
                })
              }
            >
              <Sparkles /> {promptForDay(draft.writtenOn)}
            </button>
          ) : (
            <button type="button" onClick={() => setShowPrompt(true)}>
              <Sparkles /> Ge mig en fråga att svara på
            </button>
          )}
        </div>

        <div className="p100-journal-checkin">
          <Scale
            legend="Dagsform"
            labels={PROJECT100_MOOD_LABELS}
            value={draft.mood}
            onChange={(mood) => setDraft({ ...draft, mood })}
          />
          <Scale
            legend="Energi"
            labels={PROJECT100_ENERGY_LABELS}
            value={draft.energy}
            onChange={(energy) => setDraft({ ...draft, energy })}
          />
          <label className="p100-journal-sleep">
            <span>Sömn, timmar</span>
            <input
              inputMode="decimal"
              value={draft.sleepHours}
              placeholder="7,5"
              onChange={(event) => setDraft({ ...draft, sleepHours: event.target.value })}
            />
          </label>
        </div>

        {error ? (
          <p className="p100-form-error" role="alert">
            {error}
          </p>
        ) : null}

        <footer>
          <label className={`p100-journal-exclude${draft.excludedFromAi ? " on" : ""}`}>
            <input
              type="checkbox"
              checked={draft.excludedFromAi}
              onChange={(event) => setDraft({ ...draft, excludedFromAi: event.target.checked })}
            />
            <EyeOff />
            <span>
              <b>Extra privat</b>
              <small>Undantas från Jarvis minne. Anteckningen syns bara här.</small>
            </span>
          </label>
          <button type="submit" disabled={save.kind === "saving" || isEmpty}>
            {save.kind === "saving" ? "Sparar…" : "Spara dagen"}
          </button>
        </footer>
      </form>

      <div className="p100-journal-columns">
        <section className="p100-journal-history">
          <header>
            <div>
              <span>Ditt eget arkiv</span>
              <h2>Anteckningar</h2>
            </div>
            <form action="/projekt-100/dagbok" className="p100-journal-search">
              <label>
                <Search />
                <span className="sr-only">Sök i dina anteckningar</span>
                <input
                  name="sok"
                  value={query}
                  placeholder="Sök i det du skrivit"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </form>
          </header>
          {entries.length === 0 ? (
            <div className="p100-journal-empty">
              <BookOpen />
              <strong>
                {view.query ? "Inget svarar mot sökningen" : "Din dagbok börjar här"}
              </strong>
              <p>
                {view.query
                  ? `Ingen anteckning i perioden innehåller ”${view.query}”.`
                  : "Skriv några rader om idag. Om ett år är det de raderna som säger vad resan faktiskt kostade och gav."}
              </p>
            </div>
          ) : (
            <ol>
              {entries.map((entry) => (
                <li key={entry.writtenOn} className={entry.writtenOn === draft.writtenOn ? "active" : undefined}>
                  <Link href={`/projekt-100/dagbok?dag=${entry.writtenOn}`}>
                    <span className="p100-journal-date">
                      <b>{dayFormatter.format(new Date(`${entry.writtenOn}T12:00:00`))}</b>
                      {entry.excludedFromAi ? <Lock /> : null}
                    </span>
                    <span className="p100-journal-preview">
                      {journalExcerpt(entry.body, 140) || "Bara dagsform loggad"}
                    </span>
                    {entry.mood !== null || entry.energy !== null ? (
                      <span className="p100-journal-tags">
                        {entry.mood !== null ? <i>{PROJECT100_MOOD_LABELS[entry.mood]}</i> : null}
                        {entry.energy !== null ? (
                          <i>Energi {PROJECT100_ENERGY_LABELS[entry.energy]}</i>
                        ) : null}
                      </span>
                    ) : null}
                  </Link>
                  <button
                    type="button"
                    className="p100-icon-button"
                    aria-label={`Ta bort anteckningen ${entry.writtenOn}`}
                    onClick={() => void remove(entry)}
                  >
                    <Trash2 />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="p100-timeline">
          <header>
            <div>
              <span>Minnas</span>
              <h2>Privat tidslinje</h2>
            </div>
            {timeline.some((day) => day.items.some((item) => item.sensitive)) ? (
              <button
                type="button"
                className={revealSensitive ? "active" : ""}
                onClick={() => setRevealSensitive((current) => !current)}
              >
                {revealSensitive ? "Dölj kroppsbilder" : "Visa kroppsbilder"}
              </button>
            ) : null}
          </header>
          {timeline.length === 0 ? (
            <div className="p100-journal-empty">
              <PenLine />
              <strong>Ingenting loggat i perioden</strong>
              <p>
                Tidslinjen väver ihop pass, måltider, mätningar, bilder och anteckningar.
                Så fort du loggar något dyker dagen upp här.
              </p>
            </div>
          ) : (
            <ol className="p100-timeline-days">
              {timeline.map((day) => (
                <li key={day.on}>
                  <h3>{longFormatter.format(new Date(`${day.on}T12:00:00`))}</h3>
                  <ul>
                    {day.items.map((item) => {
                      const Icon = TIMELINE_ICONS[item.kind];
                      const covered = item.sensitive && !revealSensitive;
                      return (
                        <li key={item.id} className={`kind-${item.kind}`}>
                          <span className="p100-timeline-mark">
                            <Icon />
                          </span>
                          <div>
                            <small>
                              {PROJECT100_TIMELINE_LABELS[item.kind]}
                              {item.atMinute !== null ? ` · ${minuteOfDay(item.atMinute)}` : ""}
                            </small>
                            {item.href ? (
                              <Link href={item.href}>{covered ? "Kroppsbild" : item.title}</Link>
                            ) : (
                              <b>{covered ? "Kroppsbild" : item.title}</b>
                            )}
                            {item.detail && !covered ? <p>{item.detail}</p> : null}
                          </div>
                          {covered ? (
                            <span className="p100-timeline-locked">
                              <Lock />
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

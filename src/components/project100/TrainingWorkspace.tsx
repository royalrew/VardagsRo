"use client";

import {
  Activity,
  Bike,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Dumbbell,
  Flame,
  Footprints,
  Gauge,
  Leaf,
  MapPin,
  Mountain,
  Plus,
  ScanLine,
  Search,
  SkipForward,
  Sparkles,
  Trash2,
  TrendingUp,
  Trophy,
  Wind,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { RunningQuickLogModal } from "./RunningQuickLogModal";
import { WorkoutQuickModal } from "./WorkoutQuickModal";
import {
  buildRunningAnalytics,
  evaluateProject100Benchmarks,
} from "@/lib/project100-benchmarks";
import {
  PROJECT100_ACTIVITY_LABELS,
  PROJECT100_ACTIVITY_TYPES,
  buildProject100TrainingSummary,
  type Project100ActivityType,
  type Project100SetMetrics,
  type Project100TrainingSession,
  type Project100TrainingTemplate,
  type Project100TrainingView,
} from "@/lib/project100-training";

type Composer = "session" | "template" | null;
type SessionFilter = "all" | "completed" | "planned";

interface DraftSet {
  id: string;
  reps: string;
  weightKg: string;
  durationMinutes: string;
  distanceKm: string;
  rpe: string;
}

interface DraftExercise {
  id: string;
  name: string;
  notes: string;
  sets: DraftSet[];
}

interface SessionDraft {
  title: string;
  activityType: Project100ActivityType;
  status: "planned" | "completed";
  sessionDate: string;
  templateId: string | null;
  durationMinutes: string;
  location: string;
  effort: string;
  bodyBefore: string;
  bodyAfter: string;
  notes: string;
  exercises: DraftExercise[];
}

interface TemplateDraft {
  name: string;
  activityType: Project100ActivityType;
  description: string;
  exercises: DraftExercise[];
}

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "short",
});

function draftId(): string {
  return crypto.randomUUID();
}

function blankSet(metrics?: Project100SetMetrics | null): DraftSet {
  return {
    id: draftId(),
    reps: metrics?.reps?.toString() ?? "",
    weightKg: metrics?.weightKg?.toString() ?? "",
    durationMinutes:
      metrics?.durationSeconds === null || metrics?.durationSeconds === undefined
        ? ""
        : String(Math.round((metrics.durationSeconds / 60) * 10) / 10),
    distanceKm:
      metrics?.distanceMeters === null || metrics?.distanceMeters === undefined
        ? ""
        : String(Math.round((metrics.distanceMeters / 1000) * 100) / 100),
    rpe: metrics?.rpe?.toString() ?? "",
  };
}

function blankExercise(): DraftExercise {
  return { id: draftId(), name: "", notes: "", sets: [blankSet()] };
}

function sessionDraft(today: string): SessionDraft {
  return {
    title: "",
    activityType: "strength_home",
    status: "completed",
    sessionDate: today,
    templateId: null,
    durationMinutes: "",
    location: "Hemma",
    effort: "",
    bodyBefore: "",
    bodyAfter: "",
    notes: "",
    exercises: [blankExercise()],
  };
}

function templateDraft(): TemplateDraft {
  return {
    name: "",
    activityType: "strength_home",
    description: "",
    exercises: [blankExercise()],
  };
}

function draftExercises(template: Project100TrainingTemplate): DraftExercise[] {
  return template.exercises.map((exercise) => ({
    id: draftId(),
    name: exercise.name,
    notes: exercise.notes ?? "",
    sets: exercise.sets.map((set) => blankSet(set.target)),
  }));
}

function optionalNumber(value: string, label: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} måste vara ett positivt tal.`);
  }
  return parsed;
}

function apiExercises(exercises: DraftExercise[]) {
  return exercises.map((exercise) => ({
    name: exercise.name.trim(),
    notes: exercise.notes.trim() || null,
    sets: exercise.sets.map((set) => ({
      reps: optionalNumber(set.reps, "Repetitioner"),
      weightKg: optionalNumber(set.weightKg, "Vikt"),
      durationSeconds: (() => {
        const minutes = optionalNumber(set.durationMinutes, "Tid");
        return minutes === null ? null : Math.round(minutes * 60);
      })(),
      distanceMeters: (() => {
        const distance = optionalNumber(set.distanceKm, "Distans");
        return distance === null ? null : Math.round(distance * 1000);
      })(),
      rpe: optionalNumber(set.rpe, "RPE"),
    })),
  }));
}

async function failureFrom(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    details?: string;
  } | null;
  return new Error(body?.details ?? body?.error ?? fallback);
}

function activityIcon(type: Project100ActivityType) {
  if (type === "running") return Footprints;
  if (type === "cycling" || type === "spinning") return Bike;
  if (type === "forest") return Leaf;
  if (type === "outdoor_gym") return Mountain;
  if (type === "mobility") return Activity;
  return Dumbbell;
}

function formatDate(date: string): string {
  return dateFormatter.format(new Date(`${date}T12:00:00`));
}

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

function metricText(metrics: Project100SetMetrics | null): string {
  if (!metrics) return "Inga värden";
  const values: string[] = [];
  if (metrics.reps !== null) values.push(`${metrics.reps} reps`);
  if (metrics.weightKg !== null) values.push(`${metrics.weightKg} kg`);
  if (metrics.durationSeconds !== null) values.push(formatDuration(metrics.durationSeconds) ?? "");
  if (metrics.distanceMeters !== null) {
    values.push(
      metrics.distanceMeters >= 1000
        ? `${Math.round((metrics.distanceMeters / 1000) * 100) / 100} km`
        : `${metrics.distanceMeters} m`,
    );
  }
  if (metrics.rpe !== null) values.push(`RPE ${metrics.rpe}`);
  return values.filter(Boolean).join(" · ");
}

function ExerciseBuilder({
  exercises,
  onChange,
}: {
  exercises: DraftExercise[];
  onChange: (exercises: DraftExercise[]) => void;
}) {
  function updateExercise(index: number, patch: Partial<DraftExercise>) {
    onChange(exercises.map((exercise, position) => (position === index ? { ...exercise, ...patch } : exercise)));
  }

  function updateSet(exerciseIndex: number, setIndex: number, patch: Partial<DraftSet>) {
    const exercise = exercises[exerciseIndex];
    updateExercise(exerciseIndex, {
      sets: exercise.sets.map((set, position) => (position === setIndex ? { ...set, ...patch } : set)),
    });
  }

  return (
    <div className="p100-exercise-builder">
      <div className="p100-builder-heading">
        <div><span>Övningar och set</span><small>Fyll bara i de mått som passar passet.</small></div>
        <button type="button" onClick={() => onChange([...exercises, blankExercise()])}><Plus /> Övning</button>
      </div>
      {exercises.length === 0 ? (
        <div className="p100-builder-empty">Passet saknar övningar. Totaltid räcker för ett enkelt konditionspass.</div>
      ) : null}
      {exercises.map((exercise, exerciseIndex) => (
        <section className="p100-exercise-draft" key={exercise.id}>
          <header>
            <span>{String(exerciseIndex + 1).padStart(2, "0")}</span>
            <label>
              <span>Övning</span>
              <input
                required
                maxLength={120}
                value={exercise.name}
                placeholder="Till exempel armhävningar"
                onChange={(event) => updateExercise(exerciseIndex, { name: event.target.value })}
              />
            </label>
            <label>
              <span>Notering</span>
              <input
                maxLength={500}
                value={exercise.notes}
                placeholder="Valfritt"
                onChange={(event) => updateExercise(exerciseIndex, { notes: event.target.value })}
              />
            </label>
            <button
              type="button"
              className="p100-icon-button"
              aria-label={`Ta bort ${exercise.name || "övning"}`}
              onClick={() => onChange(exercises.filter((_, position) => position !== exerciseIndex))}
            ><Trash2 /></button>
          </header>
          <div className="p100-set-head" aria-hidden="true">
            <span>Set</span><span>Reps</span><span>Kg</span><span>Min</span><span>Km</span><span>RPE</span><span />
          </div>
          {exercise.sets.map((set, setIndex) => (
            <div className="p100-set-row" key={set.id}>
              <b>{setIndex + 1}</b>
              {(
                [
                  ["reps", set.reps, "Reps"],
                  ["weightKg", set.weightKg, "Kg"],
                  ["durationMinutes", set.durationMinutes, "Min"],
                  ["distanceKm", set.distanceKm, "Km"],
                  ["rpe", set.rpe, "RPE"],
                ] as const
              ).map(([field, value, label]) => (
                <label key={field}>
                  <span>{label}</span>
                  <input
                    inputMode="decimal"
                    value={value}
                    aria-label={`${label}, set ${setIndex + 1}`}
                    onChange={(event) => updateSet(exerciseIndex, setIndex, { [field]: event.target.value })}
                  />
                </label>
              ))}
              <button
                type="button"
                className="p100-icon-button"
                aria-label={`Ta bort set ${setIndex + 1}`}
                onClick={() => updateExercise(exerciseIndex, { sets: exercise.sets.filter((_, position) => position !== setIndex) })}
              ><X /></button>
            </div>
          ))}
          <button type="button" className="p100-add-set" onClick={() => updateExercise(exerciseIndex, { sets: [...exercise.sets, blankSet()] })}><Plus /> Lägg till set</button>
        </section>
      ))}
    </div>
  );
}

function SessionComposer({
  draft,
  setDraft,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  draft: SessionDraft;
  setDraft: (draft: SessionDraft) => void;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <div className="p100-training-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="p100-training-modal" role="dialog" aria-modal="true" aria-labelledby="session-composer-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="p100-composer-head">
          <div><span>Träningspass</span><h2 id="session-composer-title">{draft.templateId ? "Använd passmall" : "Nytt pass"}</h2><p>Planera framåt eller logga det som faktiskt blev gjort.</p></div>
          <button type="button" onClick={onClose} aria-label="Stäng"><X /></button>
        </header>
        <form onSubmit={onSubmit}>
          <div className="p100-status-choice">
            <button type="button" className={draft.status === "completed" ? "active" : ""} onClick={() => setDraft({ ...draft, status: "completed" })}><Check /> Genomfört</button>
            <button type="button" className={draft.status === "planned" ? "active" : ""} onClick={() => setDraft({ ...draft, status: "planned" })}><CalendarClock /> Planerat</button>
          </div>
          <div className="p100-composer-grid">
            <label className="wide"><span>Rubrik</span><input required maxLength={160} value={draft.title} placeholder="Till exempel Helkropp hemma" onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <label><span>Träningsform</span><select value={draft.activityType} onChange={(event) => setDraft({ ...draft, activityType: event.target.value as Project100ActivityType })}>{PROJECT100_ACTIVITY_TYPES.map((type) => <option key={type} value={type}>{PROJECT100_ACTIVITY_LABELS[type]}</option>)}</select></label>
            <label><span>Datum</span><input required type="date" value={draft.sessionDate} onChange={(event) => setDraft({ ...draft, sessionDate: event.target.value })} /></label>
            <label><span>Totaltid, minuter</span><input inputMode="decimal" value={draft.durationMinutes} placeholder="45" onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value })} /></label>
            <label><span>Plats</span><input maxLength={200} value={draft.location} placeholder="Hemma, skogen, utegymmet…" onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label>
            <label><span>Ansträngning 1–10</span><input inputMode="numeric" value={draft.effort} placeholder="7" onChange={(event) => setDraft({ ...draft, effort: event.target.value })} /></label>
          </div>
          <ExerciseBuilder exercises={draft.exercises} onChange={(exercises) => setDraft({ ...draft, exercises })} />
          <div className="p100-notes-grid">
            <label><span>Kroppen före</span><textarea maxLength={1000} rows={3} value={draft.bodyBefore} placeholder="Energi, stelhet, känsla…" onChange={(event) => setDraft({ ...draft, bodyBefore: event.target.value })} /></label>
            <label><span>Kroppen efter</span><textarea maxLength={1000} rows={3} value={draft.bodyAfter} placeholder="Hur svarade kroppen?" onChange={(event) => setDraft({ ...draft, bodyAfter: event.target.value })} /></label>
            <label><span>Passanteckning</span><textarea maxLength={3000} rows={3} value={draft.notes} placeholder="Det du vill minnas nästa gång." onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
          </div>
          {error ? <p className="p100-form-error" role="alert">{error}</p> : null}
          <footer className="p100-composer-actions"><button type="button" onClick={onClose}>Avbryt</button><button type="submit" disabled={busy}>{busy ? "Sparar…" : draft.status === "planned" ? "Planera pass" : "Spara genomfört pass"}</button></footer>
        </form>
      </div>
    </div>
  );
}

function TemplateComposer({
  draft,
  setDraft,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  draft: TemplateDraft;
  setDraft: (draft: TemplateDraft) => void;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <div className="p100-training-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="p100-training-modal" role="dialog" aria-modal="true" aria-labelledby="template-composer-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="p100-composer-head">
          <div><span>Återanvändbart upplägg</span><h2 id="template-composer-title">Ny passmall</h2><p>Bygg en stabil grund. Du kan ändra värdena när mallen används.</p></div>
          <button type="button" onClick={onClose} aria-label="Stäng"><X /></button>
        </header>
        <form onSubmit={onSubmit}>
          <div className="p100-composer-grid">
            <label className="wide"><span>Mallnamn</span><input required maxLength={100} value={draft.name} placeholder="Till exempel 30 min helkropp" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label><span>Träningsform</span><select value={draft.activityType} onChange={(event) => setDraft({ ...draft, activityType: event.target.value as Project100ActivityType })}>{PROJECT100_ACTIVITY_TYPES.map((type) => <option key={type} value={type}>{PROJECT100_ACTIVITY_LABELS[type]}</option>)}</select></label>
            <label className="wide"><span>Beskrivning</span><input maxLength={1000} value={draft.description} placeholder="När och varför den här mallen passar" onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          </div>
          <ExerciseBuilder exercises={draft.exercises} onChange={(exercises) => setDraft({ ...draft, exercises })} />
          {error ? <p className="p100-form-error" role="alert">{error}</p> : null}
          <footer className="p100-composer-actions"><button type="button" onClick={onClose}>Avbryt</button><button type="submit" disabled={busy}>{busy ? "Sparar…" : "Spara mall"}</button></footer>
        </form>
      </div>
    </div>
  );
}

type PlanMode = "complete" | "move";

interface PerformSet extends DraftSet {
  target: Project100SetMetrics | null;
  done: boolean;
}

interface PerformExercise {
  id: string;
  name: string;
  sets: PerformSet[];
}

interface PlanDraft {
  sessionDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: string;
  location: string;
  effort: string;
  bodyBefore: string;
  bodyAfter: string;
  notes: string;
  exercises: PerformExercise[];
}

/** A plan opens prefilled with what it asked for, so agreeing takes one press. */
function planDraft(session: Project100TrainingSession): PlanDraft {
  return {
    sessionDate: session.sessionDate,
    startTime: "",
    endTime: "",
    durationMinutes:
      session.durationSeconds === null ? "" : String(Math.round(session.durationSeconds / 60)),
    location: session.location ?? "",
    effort: session.effort?.toString() ?? "",
    bodyBefore: session.bodyBefore ?? "",
    bodyAfter: session.bodyAfter ?? "",
    notes: session.notes ?? "",
    exercises: session.exercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      sets: exercise.sets.map((set) => ({
        ...blankSet(set.target),
        id: set.id,
        target: set.target,
        done: true,
      })),
    })),
  };
}

function localInstant(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

function PlanActionSheet({
  session,
  mode,
  draft,
  setDraft,
  busy,
  error,
  onClose,
  onComplete,
  onMove,
  onSkip,
}: {
  session: Project100TrainingSession;
  mode: PlanMode;
  draft: PlanDraft;
  setDraft: (draft: PlanDraft) => void;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onComplete: (event: React.FormEvent) => void;
  onMove: (event: React.FormEvent) => void;
  onSkip: () => void;
}) {
  function updateSet(exerciseIndex: number, setIndex: number, patch: Partial<PerformSet>) {
    setDraft({
      ...draft,
      exercises: draft.exercises.map((exercise, position) =>
        position !== exerciseIndex
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set, index) =>
                index === setIndex ? { ...set, ...patch } : set,
              ),
            },
      ),
    });
  }

  return (
    <div className="p100-training-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="p100-training-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-action-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="p100-composer-head">
          <div>
            <span>{PROJECT100_ACTIVITY_LABELS[session.activityType]}</span>
            <h2 id="plan-action-title">
              {mode === "complete" ? "Genomför passet" : "Flytta passet"}
            </h2>
            <p>
              {mode === "complete"
                ? "Målen står kvar som de planerades. Det du skriver in här är vad som faktiskt blev gjort."
                : "Bara datum och tid ändras. Passet räknas fortfarande som planerat."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Stäng">
            <X />
          </button>
        </header>

        {mode === "move" ? (
          <form onSubmit={onMove}>
            <div className="p100-composer-grid">
              <label>
                <span>Nytt datum</span>
                <input
                  required
                  type="date"
                  value={draft.sessionDate}
                  onChange={(event) => setDraft({ ...draft, sessionDate: event.target.value })}
                />
              </label>
              <label>
                <span>Starttid</span>
                <input
                  type="time"
                  value={draft.startTime}
                  onChange={(event) => setDraft({ ...draft, startTime: event.target.value })}
                />
              </label>
              <label>
                <span>Sluttid</span>
                <input
                  type="time"
                  value={draft.endTime}
                  disabled={!draft.startTime}
                  onChange={(event) => setDraft({ ...draft, endTime: event.target.value })}
                />
              </label>
            </div>
            {error ? (
              <p className="p100-form-error" role="alert">
                {error}
              </p>
            ) : null}
            <footer className="p100-composer-actions">
              <button type="button" onClick={onClose}>
                Avbryt
              </button>
              <button type="submit" disabled={busy}>
                {busy ? "Flyttar…" : "Flytta passet"}
              </button>
            </footer>
          </form>
        ) : (
          <form onSubmit={onComplete}>
            <div className="p100-composer-grid">
              <label>
                <span>Datum</span>
                <input
                  required
                  type="date"
                  value={draft.sessionDate}
                  onChange={(event) => setDraft({ ...draft, sessionDate: event.target.value })}
                />
              </label>
              <label>
                <span>Totaltid, minuter</span>
                <input
                  inputMode="decimal"
                  value={draft.durationMinutes}
                  placeholder="45"
                  onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value })}
                />
              </label>
              <label>
                <span>Ansträngning 1–10</span>
                <input
                  inputMode="numeric"
                  value={draft.effort}
                  placeholder="7"
                  onChange={(event) => setDraft({ ...draft, effort: event.target.value })}
                />
              </label>
              <label className="wide">
                <span>Plats</span>
                <input
                  maxLength={200}
                  value={draft.location}
                  placeholder="Hemma, skogen, utegymmet…"
                  onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                />
              </label>
            </div>

            {draft.exercises.length ? (
              <div className="p100-exercise-builder">
                <div className="p100-builder-heading">
                  <div>
                    <span>Så här gick det</span>
                    <small>Värdena är planens mål. Ändra det som blev annorlunda.</small>
                  </div>
                </div>
                {draft.exercises.map((exercise, exerciseIndex) => (
                  <section className="p100-exercise-draft p100-perform-exercise" key={exercise.id}>
                    <header>
                      <strong>{exercise.name}</strong>
                    </header>
                    <div className="p100-set-head" aria-hidden="true">
                      <span>Set</span>
                      <span>Reps</span>
                      <span>Kg</span>
                      <span>Min</span>
                      <span>Km</span>
                      <span>RPE</span>
                      <span>Klar</span>
                    </div>
                    {exercise.sets.map((set, setIndex) => (
                      <div
                        className={`p100-set-row${set.done ? "" : " p100-set-skipped"}`}
                        key={set.id}
                      >
                        <b>{setIndex + 1}</b>
                        {(
                          [
                            ["reps", set.reps, "Reps"],
                            ["weightKg", set.weightKg, "Kg"],
                            ["durationMinutes", set.durationMinutes, "Min"],
                            ["distanceKm", set.distanceKm, "Km"],
                            ["rpe", set.rpe, "RPE"],
                          ] as const
                        ).map(([field, value, label]) => (
                          <label key={field}>
                            <span>{label}</span>
                            <input
                              inputMode="decimal"
                              value={value}
                              disabled={!set.done}
                              aria-label={`${label}, ${exercise.name} set ${setIndex + 1}`}
                              onChange={(event) =>
                                updateSet(exerciseIndex, setIndex, { [field]: event.target.value })
                              }
                            />
                          </label>
                        ))}
                        <label className="p100-set-done">
                          <span className="sr-only">
                            Set {setIndex + 1} genomfört
                          </span>
                          <input
                            type="checkbox"
                            checked={set.done}
                            onChange={(event) =>
                              updateSet(exerciseIndex, setIndex, { done: event.target.checked })
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            ) : (
              <p className="p100-builder-empty">
                Passet planerades utan övningar. Totaltiden räcker för att stänga det.
              </p>
            )}

            <div className="p100-notes-grid">
              <label>
                <span>Kroppen före</span>
                <textarea
                  maxLength={1000}
                  rows={3}
                  value={draft.bodyBefore}
                  onChange={(event) => setDraft({ ...draft, bodyBefore: event.target.value })}
                />
              </label>
              <label>
                <span>Kroppen efter</span>
                <textarea
                  maxLength={1000}
                  rows={3}
                  value={draft.bodyAfter}
                  onChange={(event) => setDraft({ ...draft, bodyAfter: event.target.value })}
                />
              </label>
              <label>
                <span>Passanteckning</span>
                <textarea
                  maxLength={3000}
                  rows={3}
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                />
              </label>
            </div>

            {error ? (
              <p className="p100-form-error" role="alert">
                {error}
              </p>
            ) : null}
            <footer className="p100-composer-actions p100-plan-footer">
              <button type="button" className="p100-plan-skip" disabled={busy} onClick={onSkip}>
                <SkipForward /> Blev inte av
              </button>
              <button type="button" onClick={onClose}>
                Avbryt
              </button>
              <button type="submit" disabled={busy}>
                {busy ? "Sparar…" : "Markera som genomfört"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}

export function TrainingWorkspace({
  initialView,
  nextWorkLabel,
  initialComposer = null,
}: {
  initialView: Project100TrainingView;
  nextWorkLabel: string | null;
  initialComposer?: Composer;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initialView.sessions);
  const [templates, setTemplates] = useState(initialView.templates);
  const [composer, setComposer] = useState<Composer>(initialComposer);
  const [session, setSession] = useState(() => sessionDraft(initialView.today));
  const [template, setTemplate] = useState(templateDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SessionFilter>("all");
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [installingProgram, setInstallingProgram] = useState(false);
  const [installStatus, setInstallStatus] = useState<string | null>(null);
  const [plan, setPlan] = useState<{
    session: Project100TrainingSession;
    mode: PlanMode;
    draft: PlanDraft;
  } | null>(null);

  const summary = useMemo(
    () => buildProject100TrainingSummary(sessions, initialView.today),
    [sessions, initialView.today],
  );
  const benchmarks = useMemo(
    () => evaluateProject100Benchmarks(sessions),
    [sessions],
  );
  const runningAnalytics = useMemo(
    () => buildRunningAnalytics(sessions, initialView.today),
    [sessions, initialView.today],
  );

  async function handleInstallProgram() {
    setInstallingProgram(true);
    setInstallStatus(null);
    try {
      const res = await fetch("/api/project100/training/program/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Kunde inte installera programmet.");
      }
      const result = await res.json();
      setInstallStatus(
        `✅ Standardprogrammet 5+2 är nu installerat! (${result.plannedSessionsCreated} nya pass schemalagda för veckan).`,
      );
      router.refresh();
      const freshViewRes = await fetch("/api/project100/training/sessions").catch(() => null);
      if (freshViewRes?.ok) {
        const data = await freshViewRes.json();
        if (data.sessions) setSessions(data.sessions);
      }
    } catch (err: unknown) {
      setInstallStatus(`❌ ${err instanceof Error ? err.message : "Ett fel uppstod"}`);
    } finally {
      setInstallingProgram(false);
    }
  }

  const visibleSessions = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("sv-SE");
    return sessions.filter(
      (item) =>
        (filter === "all" || item.status === filter) &&
        (!search ||
          item.title.toLocaleLowerCase("sv-SE").includes(search) ||
          item.exercises.some((exercise) => exercise.name.toLocaleLowerCase("sv-SE").includes(search))),
    );
  }, [filter, query, sessions]);

  function closeComposer() {
    if (busy) return;
    setComposer(null);
    setError(null);
  }

  function openSession() {
    setSession(sessionDraft(initialView.today));
    setError(null);
    setComposer("session");
  }

  function startFromTemplate(item: Project100TrainingTemplate) {
    setSession({
      ...sessionDraft(initialView.today),
      title: item.name,
      activityType: item.activityType,
      templateId: item.id,
      exercises: draftExercises(item),
    });
    setError(null);
    setComposer("session");
  }

  function openPlan(session: Project100TrainingSession, mode: PlanMode) {
    setPlan({ session, mode, draft: planDraft(session) });
    setError(null);
  }

  async function patchPlan(session: Project100TrainingSession, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/project100/training/sessions/${encodeURIComponent(session.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw await failureFrom(response, "Passet kunde inte uppdateras.");
      const saved = (await response.json()) as { session: Project100TrainingSession };
      setSessions((current) =>
        current.map((item) => (item.id === saved.session.id ? saved.session : item)),
      );
      setPlan(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  }

  function completePlan(event: React.FormEvent) {
    event.preventDefault();
    if (!plan) return;
    const { draft, session } = plan;
    try {
      const minutes = optionalNumber(draft.durationMinutes, "Totaltid");
      void patchPlan(session, {
        action: "complete",
        sessionDate: draft.sessionDate,
        durationSeconds: minutes === null ? null : Math.round(minutes * 60),
        location: draft.location.trim() || null,
        effort: optionalNumber(draft.effort, "Ansträngning"),
        bodyBefore: draft.bodyBefore.trim() || null,
        bodyAfter: draft.bodyAfter.trim() || null,
        notes: draft.notes.trim() || null,
        sets: draft.exercises.flatMap((exercise) =>
          exercise.sets.map((set) =>
            set.done
              ? {
                  id: set.id,
                  reps: optionalNumber(set.reps, "Repetitioner"),
                  weightKg: optionalNumber(set.weightKg, "Vikt"),
                  durationSeconds: (() => {
                    const value = optionalNumber(set.durationMinutes, "Tid");
                    return value === null ? null : Math.round(value * 60);
                  })(),
                  distanceMeters: (() => {
                    const value = optionalNumber(set.distanceKm, "Distans");
                    return value === null ? null : Math.round(value * 1000);
                  })(),
                  rpe: optionalNumber(set.rpe, "RPE"),
                  completed: true,
                }
              : {
                  id: set.id,
                  reps: null,
                  weightKg: null,
                  durationSeconds: null,
                  distanceMeters: null,
                  rpe: null,
                  completed: false,
                },
          ),
        ),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Något gick fel.");
    }
  }

  function movePlan(event: React.FormEvent) {
    event.preventDefault();
    if (!plan) return;
    const { draft, session } = plan;
    void patchPlan(session, {
      action: "move",
      sessionDate: draft.sessionDate,
      plannedStartAt: draft.startTime ? localInstant(draft.sessionDate, draft.startTime) : null,
      plannedEndAt:
        draft.startTime && draft.endTime
          ? localInstant(draft.sessionDate, draft.endTime)
          : null,
    });
  }

  function skipPlan() {
    if (!plan) return;
    if (!window.confirm("Markera passet som inte genomfört? Det syns som en lucka, inte som ett misslyckande.")) {
      return;
    }
    void patchPlan(plan.session, {
      action: "skip",
      notes: plan.draft.notes.trim() || null,
    });
  }

  async function submitSession(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const minutes = optionalNumber(session.durationMinutes, "Totaltid");
      const effort = optionalNumber(session.effort, "Ansträngning");
      const response = await fetch("/api/project100/training/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: session.title,
          activityType: session.activityType,
          status: session.status,
          sessionDate: session.sessionDate,
          templateId: session.templateId,
          plannedStartAt: null,
          plannedEndAt: null,
          durationSeconds: minutes === null ? null : Math.round(minutes * 60),
          location: session.location.trim() || null,
          effort,
          bodyBefore: session.bodyBefore.trim() || null,
          bodyAfter: session.bodyAfter.trim() || null,
          notes: session.notes.trim() || null,
          exercises: apiExercises(session.exercises),
        }),
      });
      if (!response.ok) throw await failureFrom(response, "Passet kunde inte sparas.");
      const body = (await response.json()) as { session: Project100TrainingSession };
      setSessions((current) => [body.session, ...current.filter((item) => item.id !== body.session.id)]);
      setComposer(null);
      setSession(sessionDraft(initialView.today));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  }

  async function submitTemplate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/project100/training/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          activityType: template.activityType,
          description: template.description.trim() || null,
          exercises: apiExercises(template.exercises),
        }),
      });
      if (!response.ok) throw await failureFrom(response, "Mallen kunde inte sparas.");
      const body = (await response.json()) as { template: Project100TrainingTemplate };
      setTemplates((current) => [body.template, ...current]);
      setComposer(null);
      setTemplate(templateDraft());
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSession(item: Project100TrainingSession) {
    if (!window.confirm(`Ta bort passet ”${item.title}”?`)) return;
    const response = await fetch(`/api/project100/training/sessions/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    if (!response.ok) {
      window.alert((await failureFrom(response, "Passet kunde inte tas bort.")).message);
      return;
    }
    setSessions((current) => current.filter((sessionItem) => sessionItem.id !== item.id));
    router.refresh();
  }

  async function deleteTemplate(item: Project100TrainingTemplate) {
    if (!window.confirm(`Arkivera mallen ”${item.name}”? Tidigare pass påverkas inte.`)) return;
    const response = await fetch(`/api/project100/training/templates/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    if (!response.ok) {
      window.alert((await failureFrom(response, "Mallen kunde inte arkiveras.")).message);
      return;
    }
    setTemplates((current) => current.filter((templateItem) => templateItem.id !== item.id));
    router.refresh();
  }

  return (
    <div className="p100-training-workspace">
      <header className="p100-page-head p100-training-head">
        <div><span>Bygg · mät · förstå</span><h1>Träning</h1><p>Planera runt verkligheten, logga vad som faktiskt hände och bygg ett minne som går att lära av.</p></div>
        <div className="p100-head-actions">
          <Link className="p100-button-secondary" href="/projekt-100/traning/motion">
            <ScanLine /> Motion Lab
          </Link>
          <button
            type="button"
            className="p100-button p100-button-run"
            onClick={() => setShowRunModal(true)}
          >
            <Wind /> Logga löpning
          </button>
          <button
            type="button"
            className="p100-button p100-button-quick"
            onClick={() => setShowQuickModal(true)}
          >
            <Zap /> Snabbavsluta styrka
          </button>
          <button
            type="button"
            className="p100-button-secondary"
            onClick={() => {
              setTemplate(templateDraft());
              setError(null);
              setComposer("template");
            }}
          >
            <Sparkles /> Ny mall
          </button>
          <button type="button" className="p100-button" onClick={openSession}>
            <Plus /> Nytt pass
          </button>
        </div>
      </header>

      {/* Program installer banner if few templates or requested */}
      <section className="p100-program-banner">
        <div className="p100-program-banner-content">
          <span className="p100-program-banner-icon">
            <Trophy />
          </span>
          <div>
            <h3>Projekt 100 Standardprogram (5+2)</h3>
            <p>
              5 träningspass (Överkropp, Lugn löpning, Ben + core, Helkropp/styrka, Löpning kvalitet) + 2 aktiva återhämtningspass.
            </p>
            {installStatus ? <div className="p100-program-status">{installStatus}</div> : null}
          </div>
        </div>
        <button
          type="button"
          className="p100-button-secondary"
          onClick={handleInstallProgram}
          disabled={installingProgram}
        >
          <Sparkles /> {installingProgram ? "Installerar..." : "Installera / Återställ 5+2"}
        </button>
      </section>

      <section className="p100-training-context">
        <span><CalendarClock /></span>
        <div><small>Planeringskontext från jobbschemat</small><strong>{nextWorkLabel ?? "Inget mer arbetspass inlagt den här veckan"}</strong></div>
        <p>Jobbet läses separat. Dina privata pass kopieras aldrig till familjekalendern.</p>
      </section>

      <section className="p100-training-metrics" aria-label="Veckans träning">
        <article>
          <span><Check /></span>
          <div>
            <small>Veckans aktivitet</small>
            <strong>
              {summary.completedWorkoutsThisWeek} <i style={{ fontSize: "0.75rem", color: "#cbd3cd" }}>träning</i> · {summary.completedRecoveryThisWeek} <i style={{ fontSize: "0.75rem", color: "#8d9992" }}>recovery</i>
            </strong>
          </div>
        </article>
        <article>
          <span><Clock3 /></span>
          <div>
            <small>Träningstid</small>
            <strong>{summary.durationMinutesThisWeek} <i>min</i></strong>
          </div>
        </article>
        <article>
          <span><Gauge /></span>
          <div>
            <small>Träningsvolym</small>
            <strong>{summary.volumeKgThisWeek.toLocaleString("sv-SE")} <i>kg</i></strong>
          </div>
        </article>
        <article>
          <span><Footprints /></span>
          <div>
            <small>Löpdistans</small>
            <strong>{summary.distanceKmThisWeek.toLocaleString("sv-SE")} <i>km</i></strong>
          </div>
        </article>
      </section>

      {/* Benchmarks & Progression Section */}
      <section className="p100-benchmarks-panel">
        <header>
          <div>
            <span>Progression & personbästa</span>
            <h2>Mina nivåer & Benchmarks</h2>
          </div>
          <small>Härleds on-the-fly ur träningsloggen</small>
        </header>
        <div className="p100-benchmarks-grid">
          {benchmarks.map((b) => (
            <article key={b.id} className="p100-benchmark-card">
              <div className="p100-benchmark-card-head">
                <div className="p100-benchmark-title-wrap">
                  <span className="p100-benchmark-category">
                    {b.category === "running" ? "Löpning" : "Kroppsvikt"}
                  </span>
                  <strong>{b.name}</strong>
                </div>
                <span className="p100-benchmark-level-tag">
                  <Trophy size={11} style={{ marginRight: 4 }} /> {b.currentLevel}
                </span>
              </div>

              <div className="p100-benchmark-values">
                <span className="p100-benchmark-pb-val">{b.formattedBest}</span>
                <span className="p100-benchmark-pb-label">Personbästa</span>
              </div>

              <div className="p100-benchmark-next-target">
                <small>Nästa mål:</small>
                <strong>
                  {b.nextLevel ? `${b.nextLevel} (${b.formattedNextRequirement})` : "Maxnivå uppnådd! 🏆"}
                </strong>
                {b.formattedRemaining ? (
                  <span className="p100-benchmark-remaining">
                    {b.category === "running" ? `${b.formattedRemaining} kvar till delmål` : `${b.formattedRemaining} kvar`}
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="p100-training-columns">
        <section className="p100-training-panel p100-template-panel">
          <header><div><span>Bibliotek</span><h2>Passmallar</h2></div><small>{templates.length} aktiva</small></header>
          {templates.length === 0 ? (
            <button type="button" className="p100-training-empty" onClick={() => setComposer("template")}><Sparkles /><strong>Skapa din första passmall</strong><span>Bygg ett upplägg en gång och använd det med ett tryck.</span></button>
          ) : (
            <div className="p100-template-list">
              {templates.map((item) => {
                const Icon = activityIcon(item.activityType);
                const sets = item.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
                return (
                  <article key={item.id}>
                    <span className="p100-template-icon"><Icon /></span>
                    <div><small>{PROJECT100_ACTIVITY_LABELS[item.activityType]}</small><strong>{item.name}</strong><p>{item.exercises.length} övningar · {sets} set</p></div>
                    <button type="button" className="p100-use-template" onClick={() => startFromTemplate(item)}>Använd</button>
                    <button type="button" className="p100-icon-button" aria-label={`Arkivera ${item.name}`} onClick={() => void deleteTemplate(item)}><Trash2 /></button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="p100-training-panel p100-plan-panel">
          <header><div><span>Framåt</span><h2>Planerade pass</h2></div><small>{summary.planned} väntar</small></header>
          {sessions.filter((item) => item.status === "planned").length === 0 ? (
            <div className="p100-plan-empty"><CalendarClock /><div><strong>Ingen låst plan ännu</strong><p>Skapa ett pass när du ser ett realistiskt fönster runt jobbet.</p></div><button type="button" onClick={openSession}>Planera</button></div>
          ) : (
            <div className="p100-planned-list">
              {sessions.filter((item) => item.status === "planned").slice(0, 4).map((item) => {
                const Icon = activityIcon(item.activityType);
                return (
                  <article key={item.id}>
                    <span><Icon /></span>
                    <div><small>{formatDate(item.sessionDate)} · {PROJECT100_ACTIVITY_LABELS[item.activityType]}</small><strong>{item.title}</strong></div>
                    <div className="p100-plan-actions">
                      <button type="button" className="p100-plan-do" onClick={() => openPlan(item, "complete")}>Genomför</button>
                      <button type="button" onClick={() => openPlan(item, "move")}>Flytta</button>
                      <button type="button" className="p100-icon-button" aria-label={`Ta bort ${item.title}`} onClick={() => void deleteSession(item)}><Trash2 /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="p100-training-panel p100-history-panel">
        <header className="p100-history-head"><div><span>Faktiskt genomfört</span><h2>Historik</h2></div><div className="p100-history-tools"><label><Search /><span className="sr-only">Sök historik</span><input value={query} placeholder="Sök pass eller övning" onChange={(event) => setQuery(event.target.value)} /></label><div>{(["all", "completed", "planned"] as const).map((value) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "Alla" : value === "completed" ? "Genomförda" : "Planerade"}</button>)}</div></div></header>
        {visibleSessions.length === 0 ? (
          <div className="p100-history-empty"><Dumbbell /><strong>{sessions.length ? "Inga pass matchar filtret" : "Din träningshistorik börjar här"}</strong><p>Logga ett enkelt pass med totaltid eller gå hela vägen ner på setnivå.</p><button type="button" onClick={openSession}><Plus /> Logga första passet</button></div>
        ) : (
          <div className="p100-session-list">
            {visibleSessions.map((item) => {
              const Icon = activityIcon(item.activityType);
              const setCount = item.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
              return (
                <details key={item.id} className="p100-session-row">
                  <summary>
                    <span className="p100-session-icon"><Icon /></span>
                    <div className="p100-session-title"><small>{formatDate(item.sessionDate)} · {PROJECT100_ACTIVITY_LABELS[item.activityType]}</small><strong>{item.title}</strong></div>
                    <div className="p100-session-facts">{item.durationSeconds !== null ? <span><Clock3 /> {formatDuration(item.durationSeconds)}</span> : null}{item.location ? <span><MapPin /> {item.location}</span> : null}<span>{item.exercises.length} övn · {setCount} set</span></div>
                    <span className={`p100-session-status ${item.status}`}>{item.status === "completed" ? "Genomfört" : item.status === "planned" ? "Planerat" : item.status}</span>
                    <ChevronDown className="p100-session-chevron" />
                  </summary>
                  <div className="p100-session-detail">
                    {item.exercises.length ? <div className="p100-session-exercises">{item.exercises.map((exercise) => <article key={exercise.id}><header><strong>{exercise.name}</strong>{exercise.notes ? <small>{exercise.notes}</small> : null}</header><ol>{exercise.sets.map((set) => <li key={set.id}><b>{set.position + 1}</b><span>{metricText(set.actual ?? set.target)}</span>{set.target && set.actual ? <small>Mål: {metricText(set.target)}</small> : null}</li>)}</ol></article>)}</div> : <p className="p100-session-no-exercises">Det här passet loggades med totaltid utan övningsdetaljer.</p>}
                    {(item.bodyBefore || item.bodyAfter || item.notes) ? <div className="p100-session-notes">{item.bodyBefore ? <p><small>Före</small>{item.bodyBefore}</p> : null}{item.bodyAfter ? <p><small>Efter</small>{item.bodyAfter}</p> : null}{item.notes ? <p><small>Anteckning</small>{item.notes}</p> : null}</div> : null}
                    <div className="p100-session-detail-actions"><button type="button" onClick={() => void deleteSession(item)}><Trash2 /> Ta bort felaktig logg</button></div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      {composer === "session" ? <SessionComposer draft={session} setDraft={setSession} busy={busy} error={error} onClose={closeComposer} onSubmit={submitSession} /> : null}
      {composer === "template" ? <TemplateComposer draft={template} setDraft={setTemplate} busy={busy} error={error} onClose={closeComposer} onSubmit={submitTemplate} /> : null}
      <WorkoutQuickModal
        isOpen={showQuickModal}
        onClose={() => setShowQuickModal(false)}
        templates={templates}
        plannedSessions={sessions.filter((s) => s.status === "planned")}
        todayDate={initialView.today}
        onSaved={() => {
          setShowQuickModal(false);
          router.refresh();
        }}
      />
      <RunningQuickLogModal
        isOpen={showRunModal}
        onClose={() => setShowRunModal(false)}
        todayDate={initialView.today}
        onSaved={() => {
          setShowRunModal(false);
          router.refresh();
        }}
      />
      {plan ? (
        <PlanActionSheet
          session={plan.session}
          mode={plan.mode}
          draft={plan.draft}
          setDraft={(draft) => setPlan({ ...plan, draft })}
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) {
              setPlan(null);
              setError(null);
            }
          }}
          onComplete={completePlan}
          onMove={movePlan}
          onSkip={skipPlan}
        />
      ) : null}
    </div>
  );
}

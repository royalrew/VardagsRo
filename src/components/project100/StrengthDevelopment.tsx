"use client";

import { Award, Dumbbell, Save, Tags } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { MetricChart } from "@/components/project100/MetricChart";
import { MuscleRadarChart } from "@/components/project100/MuscleRadarChart";
import {
  buildProject100MuscleCoverage,
  PROJECT100_MUSCLE_GROUPS,
  PROJECT100_MUSCLE_GROUP_LABELS,
  type Project100MuscleGroup,
  type Project100StrengthDevelopment,
  type Project100StrengthExercise,
  type Project100StrengthPoint,
  type Project100StrengthSetPerformance,
} from "@/lib/project100-strength";

const STRENGTH_METRICS = ["volume", "weight", "set-volume", "reps"] as const;
type StrengthMetric = (typeof STRENGTH_METRICS)[number];

const metricDefinitions: Record<
  StrengthMetric,
  {
    label: string;
    shortLabel: string;
    unit: "kg" | "reps";
    value: (point: Project100StrengthPoint) => number | null;
    emptyDescription: string;
  }
> = {
  volume: {
    label: "Träningsvolym per dag",
    shortLabel: "Volym",
    unit: "kg",
    value: (point) => point.volumeKg,
    emptyDescription:
      "Det finns inga genomförda set med både repetitioner och vikt i den valda perioden.",
  },
  weight: {
    label: "Tyngsta vikt",
    shortLabel: "Tyngsta vikt",
    unit: "kg",
    value: (point) => point.heaviestSet?.weightKg ?? null,
    emptyDescription:
      "Det finns inget genomfört set med både repetitioner och vikt i den valda perioden.",
  },
  "set-volume": {
    label: "Största setvolym",
    shortLabel: "Setvolym",
    unit: "kg",
    value: (point) => point.topSet?.volumeKg ?? null,
    emptyDescription:
      "Det finns inget genomfört set med både repetitioner och vikt i den valda perioden.",
  },
  reps: {
    label: "Repetitioner",
    shortLabel: "Reps",
    unit: "reps",
    value: (point) => point.totalReps,
    emptyDescription: "Det finns inga genomförda repetitioner i den valda perioden.",
  },
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDate(calendarDate: string): string {
  return dateFormatter.format(new Date(`${calendarDate}T12:00:00`));
}

function formatKg(value: number | null): string {
  if (value === null) return "—";
  return `${(Math.round(value * 10) / 10).toLocaleString("sv-SE", {
    maximumFractionDigits: 1,
  })} kg`;
}

function formatPerformance(performance: Project100StrengthSetPerformance | null): string {
  if (performance === null) return "—";
  return `${formatKg(performance.weightKg)} × ${performance.reps}`;
}

async function failureFrom(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    details?: string;
  } | null;
  return new Error(body?.details ?? body?.error ?? fallback);
}

function strengthMetric(
  value: string | null,
  exercise: Project100StrengthExercise | null,
): StrengthMetric {
  const requested = STRENGTH_METRICS.includes(value as StrengthMetric)
    ? (value as StrengthMetric)
    : "volume";
  return exercise !== null && exercise.coverage.visibleWeightedSets === 0
    ? "reps"
    : requested;
}

function selectedExercise(
  development: Project100StrengthDevelopment,
  exerciseId: string | null,
): Project100StrengthExercise | null {
  return (
    development.exercises.find((exercise) => exercise.exerciseId === exerciseId) ??
    development.exercises[0] ??
    null
  );
}

export function StrengthDevelopment({
  development,
  domain,
  selectedExerciseId,
  selectedMetric,
}: {
  development: Project100StrengthDevelopment;
  domain: { from: string; to: string };
  selectedExerciseId: string | null;
  selectedMetric: string | null;
}) {
  const router = useRouter();
  const exercise = selectedExercise(development, selectedExerciseId);
  const metric = strengthMetric(selectedMetric, exercise);
  const [muscleOverrides, setMuscleOverrides] = useState<
    Record<string, Project100MuscleGroup[]>
  >({});
  const [editingMuscles, setEditingMuscles] = useState(false);
  const [muscleDraft, setMuscleDraft] = useState<Project100MuscleGroup[]>([]);
  const [muscleBusy, setMuscleBusy] = useState(false);
  const [muscleError, setMuscleError] = useState<string | null>(null);

  const muscleDevelopment = useMemo<Project100StrengthDevelopment>(
    () => ({
      ...development,
      exercises: development.exercises.map((item) => ({
        ...item,
        muscleGroups: muscleOverrides[item.exerciseId] ?? item.muscleGroups,
      })),
    }),
    [development, muscleOverrides],
  );
  const muscleCoverage = useMemo(
    () => buildProject100MuscleCoverage(muscleDevelopment),
    [muscleDevelopment],
  );
  const unclassifiedNames = muscleCoverage.unclassifiedExerciseIds.flatMap((exerciseId) => {
    const found = development.exercises.find((item) => item.exerciseId === exerciseId);
    return found ? [found.name] : [];
  });
  const selectedMuscleGroups = exercise
    ? (muscleOverrides[exercise.exerciseId] ?? exercise.muscleGroups)
    : [];
  const definition = metricDefinitions[metric];
  const chartPoints = useMemo(
    () =>
      exercise?.points.flatMap((point) => {
        const value = definition.value(point);
        return value === null ? [] : [{ measuredOn: point.measuredOn, value }];
      }) ?? [],
    [definition, exercise],
  );

  const latest = exercise?.points.at(-1) ?? null;
  const periodVolume =
    exercise?.points.reduce((total, point) => total + (point.volumeKg ?? 0), 0) ?? 0;
  const periodReps =
    exercise?.points.reduce((total, point) => total + (point.totalReps ?? 0), 0) ?? 0;
  const weightRecord = exercise?.recordsAsOfTo.heaviestSet ?? null;
  const repsRecord = exercise?.recordsAsOfTo.topReps ?? null;

  function replaceFilters(values: Partial<Record<"ovning" | "styrkematt", string>>) {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
    }
    router.replace(`/projekt-100/kropp?${params.toString()}`, { scroll: false });
  }

  function chooseExercise(next: string) {
    const nextExercise = selectedExercise(development, next);
    const nextMetric = strengthMetric(metric, nextExercise);
    setEditingMuscles(false);
    setMuscleError(null);
    replaceFilters({ ovning: next, styrkematt: nextMetric });
  }

  function chooseMetric(next: StrengthMetric) {
    replaceFilters({ styrkematt: next });
  }

  function openMuscleEditor() {
    setMuscleDraft(selectedMuscleGroups);
    setMuscleError(null);
    setEditingMuscles(true);
  }

  function toggleMuscleGroup(muscleGroup: Project100MuscleGroup) {
    setMuscleDraft((current) =>
      current.includes(muscleGroup)
        ? current.filter((item) => item !== muscleGroup)
        : [...current, muscleGroup],
    );
  }

  async function saveMuscleGroups() {
    if (!exercise) return;
    setMuscleBusy(true);
    setMuscleError(null);
    try {
      const response = await fetch(
        `/api/project100/training/exercises/${encodeURIComponent(exercise.exerciseId)}/muscles`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ muscleGroups: muscleDraft }),
        },
      );
      if (!response.ok) {
        throw await failureFrom(response, "Muskelgrupperna kunde inte sparas.");
      }
      const saved = (await response.json()) as { muscleGroups: Project100MuscleGroup[] };
      setMuscleOverrides((current) => ({
        ...current,
        [exercise.exerciseId]: saved.muscleGroups,
      }));
      setEditingMuscles(false);
      router.refresh();
    } catch (caught) {
      setMuscleError(caught instanceof Error ? caught.message : "Något gick fel.");
    } finally {
      setMuscleBusy(false);
    }
  }

  return (
    <>
      <section className="p100-strength-card" aria-labelledby="p100-strength-title">
        <header>
          <div>
            <span>Prestation i samma period</span>
            <h2 id="p100-strength-title">Styrkeutveckling</h2>
          </div>
          {development.exercises.length > 0 ? (
            <label className="p100-strength-exercise-select">
              <span>Övning</span>
              <select
                value={exercise?.exerciseId ?? ""}
                onChange={(event) => chooseExercise(event.target.value)}
              >
                {development.exercises.map((option) => (
                  <option key={option.exerciseId} value={option.exerciseId}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </header>

        {exercise === null ? (
          <div className="p100-strength-empty">
            <Dumbbell aria-hidden="true" />
            <strong>Ingen styrka loggad ännu</strong>
            <p>
              Genomförda set med ett faktiskt utfall visas här. Planerade set räknas aldrig som
              utveckling.
            </p>
          </div>
        ) : (
          <>
          <div className="p100-strength-toolbar">
            <div>
              <strong>{exercise.name}</strong>
              <span>
                Volym = faktiska repetitioner × vikt. Planerade och överhoppade set räknas inte.
              </span>
            </div>
            <div className="p100-strength-metric-switch" role="group" aria-label="Styrkemått">
              {STRENGTH_METRICS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={metric === key}
                  className={metric === key ? "active" : undefined}
                  disabled={key !== "reps" && exercise.coverage.visibleWeightedSets === 0}
                  onClick={() => chooseMetric(key)}
                >
                  {metricDefinitions[key].shortLabel}
                </button>
              ))}
            </div>
          </div>

          <div className="p100-strength-muscle-summary">
            <div>
              <Tags aria-hidden="true" />
              {selectedMuscleGroups.length > 0 ? (
                <ul aria-label={`Muskelgrupper för ${exercise.name}`}>
                  {selectedMuscleGroups.map((muscleGroup) => (
                    <li key={muscleGroup}>{PROJECT100_MUSCLE_GROUP_LABELS[muscleGroup]}</li>
                  ))}
                </ul>
              ) : (
                <span>Övningen är inte kategoriserad ännu</span>
              )}
            </div>
            <button type="button" onClick={openMuscleEditor}>
              Ändra muskelgrupper
            </button>
          </div>

          {editingMuscles ? (
            <div className="p100-strength-muscle-editor">
              <fieldset>
                <legend>Vilka muskelgrupper arbetar i {exercise.name}?</legend>
                <p>
                  Välj alla som ska få ett arbetsset i fördelningsdiagrammet. Appen gissar
                  inte från övningsnamnet.
                </p>
                <div>
                  {PROJECT100_MUSCLE_GROUPS.map((muscleGroup) => (
                    <label key={muscleGroup}>
                      <input
                        type="checkbox"
                        checked={muscleDraft.includes(muscleGroup)}
                        onChange={() => toggleMuscleGroup(muscleGroup)}
                      />
                      <span>{PROJECT100_MUSCLE_GROUP_LABELS[muscleGroup]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {muscleError ? <p className="p100-form-error">{muscleError}</p> : null}
              <div className="p100-strength-muscle-actions">
                <button
                  type="button"
                  className="p100-button-secondary"
                  disabled={muscleBusy}
                  onClick={() => setEditingMuscles(false)}
                >
                  Avbryt
                </button>
                <button
                  type="button"
                  className="p100-button"
                  disabled={muscleBusy}
                  onClick={() => void saveMuscleGroups()}
                >
                  <Save aria-hidden="true" /> {muscleBusy ? "Sparar…" : "Spara grupper"}
                </button>
              </div>
            </div>
          ) : null}

          <dl className="p100-strength-stats">
            <div>
              <dt>Senaste logg</dt>
              <dd>{latest ? formatDate(latest.measuredOn) : "—"}</dd>
              <small>{latest ? `${latest.completedSets} genomförda set` : "Ingen i perioden"}</small>
            </div>
            <div>
              <dt>
                {exercise.coverage.visibleWeightedSets > 0
                  ? "Volym i perioden"
                  : "Reps i perioden"}
              </dt>
              <dd>
                {exercise.coverage.visibleWeightedSets > 0
                  ? formatKg(periodVolume)
                  : periodReps.toLocaleString("sv-SE")}
              </dd>
              <small>
                {exercise.coverage.visibleWeightedSets > 0
                  ? `${exercise.coverage.visibleWeightedSets} viktade set`
                  : `${exercise.coverage.visibleCompletedSets} genomförda set`}
              </small>
            </div>
            <div>
              <dt>
                {weightRecord ? "Tyngsta set t.o.m. perioden" : "Flest reps i ett set"}
              </dt>
              <dd>
                {weightRecord
                  ? formatPerformance(weightRecord.value)
                  : repsRecord
                    ? `${repsRecord.value.toLocaleString("sv-SE")} reps`
                    : "—"}
              </dd>
              <small>
                {weightRecord
                  ? `Personbästa ${formatDate(weightRecord.achievedOn)}`
                  : repsRecord
                    ? `Personbästa ${formatDate(repsRecord.achievedOn)}`
                    : "Underlag saknas"}
              </small>
            </div>
            <div>
              <dt>Datatäckning</dt>
              <dd>{exercise.coverage.visibleDays} dagar</dd>
              <small>{exercise.coverage.visibleCompletedSets} genomförda set</small>
            </div>
          </dl>

          <div className="p100-strength-chart-head">
            <div>
              <span>Valt mått</span>
              <strong>{definition.label}</strong>
            </div>
            {chartPoints.length < 3 ? (
              <small className="p100-body-coverage">
                {chartPoints.length === 0
                  ? "Inget jämförbart värde i perioden"
                  : `Bara ${chartPoints.length} loggad ${chartPoints.length === 1 ? "dag" : "dagar"} — för lite för en trend`}
              </small>
            ) : null}
          </div>
          <MetricChart
            key={`${exercise.exerciseId}-${metric}`}
            label={definition.label}
            unit={definition.unit}
            points={chartPoints}
            reference={null}
            domain={domain}
            pointNoun="loggade dagar"
            emptyTitle="Inget jämförbart styrkevärde"
            emptyDescription={definition.emptyDescription}
          />

          <div className="p100-strength-table-scroll">
            <table className="p100-strength-table">
              <caption>
                Genomförda värden för {exercise.name} i den valda perioden. Samma underlag som
                grafen bygger på.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Datum</th>
                  <th scope="col">Pass</th>
                  <th scope="col">Set</th>
                  <th scope="col">Reps</th>
                  <th scope="col">Tyngsta set</th>
                  <th scope="col">Volym</th>
                  <th scope="col">Personbästa</th>
                </tr>
              </thead>
              <tbody>
                {exercise.points.length === 0 ? (
                  <tr>
                    <td colSpan={7}>Övningen har inga genomförda set i den här perioden.</td>
                  </tr>
                ) : (
                  exercise.points.map((point) => {
                    const records = [
                      point.isHeaviestSetPr ? "Tyngsta vikt" : null,
                      point.isRepsPr ? "Repetitioner" : null,
                      point.isTopSetPr ? "Setvolym" : null,
                    ].filter((label): label is string => label !== null);
                    return (
                      <tr key={point.measuredOn}>
                        <th scope="row">{formatDate(point.measuredOn)}</th>
                        <td>
                          <ul>
                            {point.sessions.map((session) => (
                              <li key={session.sessionId}>{session.title}</li>
                            ))}
                          </ul>
                        </td>
                        <td>{point.completedSets}</td>
                        <td>{point.totalReps ?? "—"}</td>
                        <td>{formatPerformance(point.heaviestSet)}</td>
                        <td>{formatKg(point.volumeKg)}</td>
                        <td>
                          {records.length > 0 ? (
                            <span
                              className="p100-strength-pr"
                              aria-label={`Personbästa hittills: ${records.join(", ")}`}
                            >
                              <Award aria-hidden="true" /> {records.join(", ")}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="p100-strength-context">
            Styrkan och kroppsmåttet delar datumperiod, men inte skala. De visas bredvid varandra
            som sammanhang — inte som ett påstående om orsak eller muskelmassa.
          </p>
          </>
        )}
      </section>

      <section className="p100-muscle-card" aria-labelledby="p100-muscle-title">
        <header>
          <div>
            <span>Arbetsset i samma period</span>
            <h2 id="p100-muscle-title">Muskelbalans</h2>
          </div>
          <small>Radardiagram · spindeldiagram</small>
        </header>
        <div className="p100-muscle-layout">
          <MuscleRadarChart groups={muscleCoverage.groups} />
          <div className="p100-muscle-details">
            <div className="p100-muscle-table-scroll">
              <table className="p100-muscle-table">
                <caption>Exakta värden som radardiagrammet bygger på.</caption>
                <thead>
                  <tr>
                    <th scope="col">Muskelgrupp</th>
                    <th scope="col">Arbetsset</th>
                    <th scope="col">Övningar</th>
                  </tr>
                </thead>
                <tbody>
                  {muscleCoverage.groups.map((group) => (
                    <tr key={group.muscleGroup}>
                      <th scope="row">{group.label}</th>
                      <td>{group.completedSets}</td>
                      <td>{group.exerciseCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {muscleCoverage.unclassifiedSets > 0 ? (
              <div className="p100-muscle-unclassified" role="note">
                <strong>
                  {muscleCoverage.unclassifiedSets} arbetsset saknar muskelgrupp
                </strong>
                <p>
                  {unclassifiedNames.join(", ")}. Välj övningen ovan och använd ”Ändra
                  muskelgrupper” för att få med dem i diagrammet.
                </p>
              </div>
            ) : null}
            <p className="p100-muscle-context">
              Ett genomfört set räknas en gång i varje vald muskelgrupp. Diagrammet visar
              träningsfördelning, inte att kilo mellan olika övningar är jämförbara eller att en
              viss muskel har vuxit.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

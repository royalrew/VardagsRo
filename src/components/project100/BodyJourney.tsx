"use client";

import {
  Camera,
  Check,
  Flag,
  ImageIcon,
  Lock,
  Plus,
  Ruler,
  Target,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { addCalendarDateDays } from "@/lib/dates";
import {
  buildProject100MetricSeries,
  buildProject100Milestones,
  formatDelta,
  formatMeasurement,
  measurementOf,
  PROJECT100_KNOWN_METRICS,
  type Project100BodyEntry,
  type Project100BodyGoal,
  type Project100BodyJourney,
} from "@/lib/project100-body";
import type { Project100MediaItem } from "@/lib/project100-media";
import type { Project100StrengthDevelopment } from "@/lib/project100-strength";
import { MetricChart } from "@/components/project100/MetricChart";
import { StrengthDevelopment as StrengthDevelopmentView } from "@/components/project100/StrengthDevelopment";
import { BodyComparisonSlider } from "@/components/project100/BodyComparisonSlider";

interface CustomDraft {
  id: string;
  label: string;
  value: string;
}

interface EntryDraft {
  measuredOn: string;
  note: string;
  values: Record<string, string>;
  custom: CustomDraft[];
}

const dateFormatter = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" });
const longDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatDate(calendarDate: string): string {
  return dateFormatter.format(new Date(`${calendarDate}T12:00:00`));
}

function emptyDraft(today: string): EntryDraft {
  return { measuredOn: today, note: "", values: {}, custom: [] };
}

function decimal(value: string, label: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} måste vara ett positivt tal.`);
  }
  return parsed;
}

function slugify(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("sv-SE")
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(slug) ? slug : `matt_${slug}`.slice(0, 40);
}

async function failureFrom(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    details?: string;
  } | null;
  return new Error(body?.details ?? body?.error ?? fallback);
}

export function BodyJourney({
  journey,
  photos,
  strength,
  activePreset,
  selectedStrengthExerciseId,
  selectedStrengthMetric,
}: {
  journey: Project100BodyJourney;
  photos: Project100MediaItem[];
  strength: Project100StrengthDevelopment;
  activePreset: string;
  selectedStrengthExerciseId: string | null;
  selectedStrengthMetric: string | null;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(journey.entries);
  const [goal, setGoal] = useState<Project100BodyGoal>(journey.goal);
  const [metric, setMetric] = useState("weight");
  const [composer, setComposer] = useState<"entry" | "goal" | null>(null);
  const [draft, setDraft] = useState(() => emptyDraft(journey.today));
  const [goalDraft, setGoalDraft] = useState({
    weightGoalKg: journey.goal.weightGoalKg?.toString() ?? "",
    startWeightKg: journey.goal.startWeightKg?.toString() ?? "",
    heightCm: journey.goal.heightCm?.toString() ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealPhotos, setRevealPhotos] = useState(false);

  const series = useMemo(() => buildProject100MetricSeries(entries), [entries]);
  const chartDomain = useMemo(() => {
    if (activePreset !== "allt") return { from: journey.from, to: journey.to };
    const actualDates = [
      ...series.flatMap((item) => item.points.map((point) => point.measuredOn)),
      ...strength.exercises.flatMap((exercise) =>
        exercise.points.map((point) => point.measuredOn),
      ),
    ];
    return {
      from: actualDates.sort((left, right) => left.localeCompare(right))[0] ?? journey.to,
      to: journey.to,
    };
  }, [activePreset, journey.from, journey.to, series, strength.exercises]);
  const milestones = useMemo(
    () => buildProject100Milestones(journey.weightHistory, goal),
    [goal, journey.weightHistory],
  );
  const active = series.find((item) => item.metric === metric) ?? series[0] ?? null;
  const nextMilestone = milestones.find((milestone) => milestone.reachedOn === null);
  const reached = milestones.filter((milestone) => milestone.reachedOn !== null).length;

  const latestWeight = journey.weightHistory.at(-1) ?? null;
  const startWeight = goal.startWeightKg;
  const sinceStart =
    latestWeight !== null && startWeight !== null ? latestWeight.value - startWeight : null;
  const toGoal =
    latestWeight !== null && goal.weightGoalKg !== null
      ? goal.weightGoalKg - latestWeight.value
      : null;

  const columns = useMemo(() => {
    const seen = new Map<string, { metric: string; label: string; unit: "kg" | "cm" }>();
    for (const item of series) {
      seen.set(item.metric, { metric: item.metric, label: item.label, unit: item.unit });
    }
    return [...seen.values()];
  }, [series]);

  const weightByDay = useMemo(
    () => new Map(journey.weightHistory.map((point) => [point.measuredOn, point.value])),
    [journey.weightHistory],
  );

  const presets = [
    { key: "30", label: "30 dagar", days: 30 },
    { key: "90", label: "90 dagar", days: 90 },
    { key: "365", label: "12 månader", days: 365 },
  ];

  function periodHref(key: string, from?: string, to?: string): string {
    const params = new URLSearchParams({ period: key });
    if (from) params.set("fran", from);
    if (to) params.set("till", to);
    if (selectedStrengthExerciseId) params.set("ovning", selectedStrengthExerciseId);
    if (selectedStrengthMetric) params.set("styrkematt", selectedStrengthMetric);
    return `/projekt-100/kropp?${params.toString()}`;
  }

  function openEntry() {
    setDraft(emptyDraft(journey.today));
    setError(null);
    setComposer("entry");
  }

  function editEntry(entry: Project100BodyEntry) {
    const values: Record<string, string> = {};
    const custom: CustomDraft[] = [];
    for (const measurement of entry.measurements) {
      if (PROJECT100_KNOWN_METRICS.some((known) => known.metric === measurement.metric)) {
        values[measurement.metric] = String(measurement.value);
      } else {
        custom.push({
          id: crypto.randomUUID(),
          label: measurement.label,
          value: String(measurement.value),
        });
      }
    }
    setDraft({ measuredOn: entry.measuredOn, note: entry.note ?? "", values, custom });
    setError(null);
    setComposer("entry");
  }

  async function saveEntry(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const measurements = [
        ...PROJECT100_KNOWN_METRICS.flatMap((known) => {
          const value = decimal(draft.values[known.metric] ?? "", known.label);
          return value === null
            ? []
            : [{ metric: known.metric, label: null, unit: known.unit, value }];
        }),
        ...draft.custom.flatMap((item) => {
          const label = item.label.trim();
          const value = decimal(item.value, label || "Eget mått");
          if (!label || value === null) return [];
          return [{ metric: slugify(label), label, unit: "cm" as const, value }];
        }),
      ];

      const response = await fetch("/api/project100/body", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          measuredOn: draft.measuredOn,
          note: draft.note.trim() || null,
          measurements,
        }),
      });
      if (!response.ok) throw await failureFrom(response, "Mätningen kunde inte sparas.");
      const saved = (await response.json()) as { entry: Project100BodyEntry };
      setEntries((current) => [
        saved.entry,
        ...current.filter((item) => item.measuredOn !== saved.entry.measuredOn),
      ]);
      setComposer(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  }

  async function saveGoal(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/project100/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weightGoalKg: decimal(goalDraft.weightGoalKg, "Målvikt"),
          startWeightKg: decimal(goalDraft.startWeightKg, "Startvikt"),
          heightCm: decimal(goalDraft.heightCm, "Längd"),
        }),
      });
      if (!response.ok) throw await failureFrom(response, "Målet kunde inte sparas.");
      const saved = (await response.json()) as { goal: Project100BodyGoal };
      setGoal(saved.goal);
      setComposer(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Något gick fel.");
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(entry: Project100BodyEntry) {
    if (!window.confirm(`Ta bort mätningen från ${longDateFormatter.format(new Date(`${entry.measuredOn}T12:00:00`))}?`)) {
      return;
    }
    const response = await fetch(`/api/project100/body/${entry.measuredOn}`, { method: "DELETE" });
    if (!response.ok) {
      window.alert((await failureFrom(response, "Mätningen kunde inte tas bort.")).message);
      return;
    }
    setEntries((current) => current.filter((item) => item.measuredOn !== entry.measuredOn));
    router.refresh();
  }

  return (
    <div className="p100-body-workspace">
      <header className="p100-page-head">
        <div>
          <span>Följ</span>
          <h1>Kropp</h1>
          <p>
            Vikten är en datapunkt, inte hela berättelsen. Mått, bilder och styrka står
            bredvid den så att en vecka går att förstå i sin helhet.
          </p>
        </div>
        <div className="p100-head-actions">
          <button
            type="button"
            className="p100-button-secondary"
            onClick={() => {
              setGoalDraft({
                weightGoalKg: goal.weightGoalKg?.toString() ?? "",
                startWeightKg: goal.startWeightKg?.toString() ?? "",
                heightCm: goal.heightCm?.toString() ?? "",
              });
              setError(null);
              setComposer("goal");
            }}
          >
            <Target /> Mål
          </button>
          <button type="button" className="p100-button" onClick={openEntry}>
            <Plus /> Logga mätning
          </button>
        </div>
      </header>

      <section className="p100-body-stats" aria-label="Var resan står nu">
        <article>
          <small>Senaste vikt</small>
          <strong>
            {latestWeight ? formatMeasurement(latestWeight.value, "kg") : "—"}
          </strong>
          <span>{latestWeight ? formatDate(latestWeight.measuredOn) : "Ingen vikt loggad"}</span>
        </article>
        <article>
          <small>Sedan start</small>
          <strong>{sinceStart === null ? "—" : formatDelta(sinceStart, "kg")}</strong>
          <span>
            {startWeight === null
              ? "Sätt en startvikt under Mål"
              : `Från ${formatMeasurement(startWeight, "kg")}`}
          </span>
        </article>
        <article>
          <small>Kvar till målet</small>
          <strong>{toGoal === null ? "—" : formatMeasurement(Math.abs(toGoal), "kg")}</strong>
          <span>
            {goal.weightGoalKg === null
              ? "Inget mål satt ännu"
              : `Mål ${formatMeasurement(goal.weightGoalKg, "kg")}`}
          </span>
        </article>
        <article>
          <small>Mätta dagar i perioden</small>
          <strong>{entries.length}</strong>
          <span>
            {formatDate(journey.from)} – {formatDate(journey.to)}
          </span>
        </article>
      </section>

      <div className="p100-body-filters">
        <nav aria-label="Period">
          {presets.map((preset) => (
            <Link
              key={preset.key}
              href={periodHref(
                preset.key,
                addCalendarDateDays(journey.today, -(preset.days - 1)),
                journey.today,
              )}
              className={activePreset === preset.key ? "active" : ""}
              aria-current={activePreset === preset.key ? "page" : undefined}
            >
              {preset.label}
            </Link>
          ))}
          <Link
            href={periodHref("allt")}
            className={activePreset === "allt" ? "active" : ""}
            aria-current={activePreset === "allt" ? "page" : undefined}
          >
            Hela resan
          </Link>
        </nav>
        {series.length > 1 ? (
          <div className="p100-body-metric-switch">
            {series.map((item) => (
              <button
                type="button"
                key={item.metric}
                className={active?.metric === item.metric ? "active" : ""}
                aria-pressed={active?.metric === item.metric}
                onClick={() => setMetric(item.metric)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="p100-body-development-grid">
        <section className="p100-body-chart-card">
          <header>
            <div>
              <span>Kropp i samma period</span>
              <h2>{active ? active.label : "Vikt"}</h2>
            </div>
            {active && active.points.length < 3 ? (
              <small className="p100-body-coverage">
                {active.points.length === 0
                  ? "Ingen mätning i perioden"
                  : `Bara ${active.points.length} mätning${active.points.length === 1 ? "" : "ar"} — för lite för en trend`}
              </small>
            ) : null}
          </header>
          <MetricChart
            key={active?.metric ?? "weight"}
            label={active?.label ?? "Vikt"}
            unit={active?.unit ?? "kg"}
            points={active?.points ?? []}
            domain={chartDomain}
            reference={
              active?.metric === "weight" && nextMilestone
                ? {
                    value: nextMilestone.weightKg,
                    label: `Nästa milstolpe ${formatMeasurement(nextMilestone.weightKg, "kg")}`,
                  }
                : null
            }
          />
        </section>

        <StrengthDevelopmentView
          development={strength}
          domain={chartDomain}
          selectedExerciseId={selectedStrengthExerciseId}
          selectedMetric={selectedStrengthMetric}
        />
      </div>

      {milestones.length > 0 ? (
        <section className="p100-body-milestones">
          <header>
            <div>
              <span>Riktning</span>
              <h2>Milstolpar</h2>
            </div>
            <small>
              {reached} av {milestones.length} passerade
            </small>
          </header>
          <ol>
            {milestones.map((milestone) => (
              <li
                key={milestone.weightKg}
                className={
                  milestone.reachedOn
                    ? "reached"
                    : milestone === nextMilestone
                      ? "next"
                      : undefined
                }
              >
                <span className="p100-milestone-mark">
                  {milestone.reachedOn ? <Check /> : <Flag />}
                </span>
                <strong>{formatMeasurement(milestone.weightKg, "kg")}</strong>
                <small>
                  {milestone.reachedOn
                    ? `Passerad ${formatDate(milestone.reachedOn)}`
                    : milestone === nextMilestone
                      ? "Nästa steg"
                      : "Framför dig"}
                </small>
              </li>
            ))}
          </ol>
          <p>
            100 kg är en riktning, inte ett bevis på ren muskelökning. Måtten och styrkan
            bredvid vikten är det som säger vad förändringen består av.
          </p>
        </section>
      ) : null}

      <section className="p100-body-table-card">
        <header>
          <div>
            <span>Underliggande värden</span>
            <h2>Mätningar</h2>
          </div>
          <small>{entries.length} dagar</small>
        </header>
        {entries.length === 0 ? (
          <div className="p100-body-empty">
            <Ruler />
            <strong>Inget mätt i den här perioden</strong>
            <p>
              Väg dig och ta måtten på samma sätt varje gång — samma våg, samma tid på
              dygnet, samma spänning i måttbandet.
            </p>
            <button type="button" onClick={openEntry}>
              <Plus /> Logga första mätningen
            </button>
          </div>
        ) : (
          <div className="p100-body-table-scroll">
            <table className="p100-body-table">
              <caption className="sr-only">
                Alla mätningar i perioden. Samma värden som grafen ovanför bygger på.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Datum</th>
                  {columns.map((column) => (
                    <th scope="col" key={column.metric}>
                      {column.label} <i>({column.unit})</i>
                    </th>
                  ))}
                  <th scope="col">Anteckning</th>
                  <th scope="col"><span className="sr-only">Åtgärder</span></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.measuredOn}>
                    <th scope="row">
                      <button type="button" onClick={() => editEntry(entry)}>
                        {formatDate(entry.measuredOn)}
                      </button>
                    </th>
                    {columns.map((column) => {
                      const measurement = measurementOf(entry, column.metric);
                      return (
                        <td key={column.metric}>
                          {measurement
                            ? (Math.round(measurement.value * 10) / 10).toLocaleString("sv-SE", {
                                maximumFractionDigits: 1,
                              })
                            : "—"}
                        </td>
                      );
                    })}
                    <td className="p100-body-note">{entry.note ?? ""}</td>
                    <td>
                      <button
                        type="button"
                        className="p100-icon-button"
                        aria-label={`Ta bort mätningen ${entry.measuredOn}`}
                        onClick={() => void removeEntry(entry)}
                      >
                        <Trash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="p100-body-photos">
        <header>
          <div>
            <span>Samma ljus, samma vinkel</span>
            <h2>Kroppsbilder</h2>
          </div>
          <div className="p100-body-photo-tools">
            {photos.length > 0 ? (
              <button
                type="button"
                className={revealPhotos ? "active" : ""}
                onClick={() => setRevealPhotos((current) => !current)}
              >
                {revealPhotos ? "Dölj" : "Visa"}
              </button>
            ) : null}
            <Link href="/projekt-100/media?kategori=body" className="p100-button-secondary">
              <Camera /> Till biblioteket
            </Link>
          </div>
        </header>
        {photos.length === 0 ? (
          <p className="p100-body-photo-empty">
            Inga kroppsbilder ännu. Ta dem framifrån, från sidan och bakifrån i samma ljus
            och på samma avstånd — då blir jämförelsen värd något.
          </p>
        ) : (
          <>
            <div className="p100-body-photo-strip">
              {photos.map((photo) => {
                const weight = weightByDay.get(photo.capturedOn);
                return (
                  <Link
                    key={photo.id}
                    href="/projekt-100/media?kategori=body"
                    className="p100-body-photo"
                  >
                    <span className={revealPhotos ? undefined : "hidden"}>
                      {photo.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo.previewUrl} alt="" loading="lazy" />
                      ) : (
                        <ImageIcon />
                      )}
                      {revealPhotos ? null : (
                        <b>
                          <Lock />
                        </b>
                      )}
                    </span>
                    <small>{formatDate(photo.capturedOn)}</small>
                    <b>{weight === undefined ? "Vikt saknas" : formatMeasurement(weight, "kg")}</b>
                  </Link>
                );
              })}
            </div>

            <BodyComparisonSlider
              photos={photos}
              weightsByDay={weightByDay}
              revealPhotos={revealPhotos}
              onToggleReveal={() => setRevealPhotos((current) => !current)}
            />
          </>
        )}
      </section>

      {composer === "entry" ? (
        <div className="p100-training-modal-backdrop" role="presentation" onMouseDown={() => !busy && setComposer(null)}>
          <div
            className="p100-training-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="body-entry-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="p100-composer-head">
              <div>
                <span>Kropp</span>
                <h2 id="body-entry-title">Logga mätning</h2>
                <p>Fyll bara i det du faktiskt mätte. Tomma fält sparas inte som nollor.</p>
              </div>
              <button type="button" onClick={() => setComposer(null)} aria-label="Stäng">
                <X />
              </button>
            </header>
            <form onSubmit={saveEntry}>
              <div className="p100-composer-grid">
                <label>
                  <span>Datum</span>
                  <input
                    required
                    type="date"
                    value={draft.measuredOn}
                    onChange={(event) => setDraft({ ...draft, measuredOn: event.target.value })}
                  />
                </label>
              </div>
              <div className="p100-body-measure-grid">
                {PROJECT100_KNOWN_METRICS.map((known) => (
                  <label key={known.metric}>
                    <span>
                      {known.label} <i>{known.unit}</i>
                    </span>
                    <input
                      inputMode="decimal"
                      value={draft.values[known.metric] ?? ""}
                      title={known.hint}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          values: { ...draft.values, [known.metric]: event.target.value },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              {draft.custom.map((item, index) => (
                <div className="p100-body-custom-row" key={item.id}>
                  <label>
                    <span>Eget mått</span>
                    <input
                      maxLength={40}
                      value={item.label}
                      placeholder="Till exempel underarm"
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          custom: draft.custom.map((entry, position) =>
                            position === index ? { ...entry, label: event.target.value } : entry,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>cm</span>
                    <input
                      inputMode="decimal"
                      value={item.value}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          custom: draft.custom.map((entry, position) =>
                            position === index ? { ...entry, value: event.target.value } : entry,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="p100-icon-button"
                    aria-label="Ta bort eget mått"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        custom: draft.custom.filter((_, position) => position !== index),
                      })
                    }
                  >
                    <X />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="p100-add-set"
                onClick={() =>
                  setDraft({
                    ...draft,
                    custom: [...draft.custom, { id: crypto.randomUUID(), label: "", value: "" }],
                  })
                }
              >
                <Plus /> Lägg till eget mått
              </button>
              <div className="p100-notes-grid">
                <label className="wide">
                  <span>Anteckning</span>
                  <textarea
                    maxLength={1000}
                    rows={2}
                    value={draft.note}
                    placeholder="Hur kändes kroppen? Sov du dåligt? Åt du salt igår?"
                    onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                  />
                </label>
              </div>
              {error ? (
                <p className="p100-form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <footer className="p100-composer-actions">
                <button type="button" onClick={() => setComposer(null)}>
                  Avbryt
                </button>
                <button type="submit" disabled={busy}>
                  {busy ? "Sparar…" : "Spara mätning"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}

      {composer === "goal" ? (
        <div className="p100-training-modal-backdrop" role="presentation" onMouseDown={() => !busy && setComposer(null)}>
          <div
            className="p100-training-modal p100-goal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="body-goal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="p100-composer-head">
              <div>
                <span>Riktning</span>
                <h2 id="body-goal-title">Mål och utgångsläge</h2>
                <p>Milstolparna räknas fram mellan startvikten och målet.</p>
              </div>
              <button type="button" onClick={() => setComposer(null)} aria-label="Stäng">
                <X />
              </button>
            </header>
            <form onSubmit={saveGoal}>
              <div className="p100-composer-grid">
                <label>
                  <span>Startvikt, kg</span>
                  <input
                    inputMode="decimal"
                    value={goalDraft.startWeightKg}
                    placeholder="80"
                    onChange={(event) =>
                      setGoalDraft({ ...goalDraft, startWeightKg: event.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Målvikt, kg</span>
                  <input
                    inputMode="decimal"
                    value={goalDraft.weightGoalKg}
                    placeholder="100"
                    onChange={(event) =>
                      setGoalDraft({ ...goalDraft, weightGoalKg: event.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Längd, cm</span>
                  <input
                    inputMode="decimal"
                    value={goalDraft.heightCm}
                    placeholder="182"
                    onChange={(event) => setGoalDraft({ ...goalDraft, heightCm: event.target.value })}
                  />
                </label>
              </div>
              {error ? (
                <p className="p100-form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <footer className="p100-composer-actions">
                <button type="button" onClick={() => setComposer(null)}>
                  Avbryt
                </button>
                <button type="submit" disabled={busy}>
                  {busy ? "Sparar…" : "Spara mål"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

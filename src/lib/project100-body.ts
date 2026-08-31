export type Project100MeasurementUnit = "kg" | "cm";

export interface Project100MetricDefinition {
  metric: string;
  label: string;
  unit: Project100MeasurementUnit;
  hint: string;
}

/**
 * The measurements a tape measure and a scale actually produce. Anything else
 * the user wants to follow is stored the same way with its own label, so a new
 * habit never needs a new column.
 */
export const PROJECT100_KNOWN_METRICS: readonly Project100MetricDefinition[] = [
  { metric: "weight", label: "Vikt", unit: "kg", hint: "Samma våg, helst samma tid på dygnet." },
  { metric: "chest", label: "Bröst", unit: "cm", hint: "Över bröstkorgens bredaste punkt." },
  { metric: "waist", label: "Midja", unit: "cm", hint: "Vid naveln, avslappnad mage." },
  { metric: "hip", label: "Höft", unit: "cm", hint: "Över sätets bredaste punkt." },
  { metric: "arm", label: "Arm", unit: "cm", hint: "Överarmens tjockaste del, spänd eller avslappnad — men välj en och håll dig till den." },
  { metric: "thigh", label: "Lår", unit: "cm", hint: "En handsbredd nedanför ljumsken." },
  { metric: "calf", label: "Vad", unit: "cm", hint: "Vadens tjockaste del." },
  { metric: "neck", label: "Hals", unit: "cm", hint: "Under adamsäpplet." },
];

const KNOWN_BY_METRIC = new Map(
  PROJECT100_KNOWN_METRICS.map((definition) => [definition.metric, definition]),
);

export function project100MetricLabel(metric: string, label: string | null): string {
  return KNOWN_BY_METRIC.get(metric)?.label ?? label ?? metric;
}

export function project100MetricUnit(metric: string): Project100MeasurementUnit {
  return KNOWN_BY_METRIC.get(metric)?.unit ?? "cm";
}

export function isKnownProject100Metric(metric: string): boolean {
  return KNOWN_BY_METRIC.has(metric);
}

export interface Project100BodyMeasurement {
  metric: string;
  label: string;
  unit: Project100MeasurementUnit;
  value: number;
}

export interface Project100BodyEntry {
  measuredOn: string;
  note: string | null;
  measurements: Project100BodyMeasurement[];
}

export interface Project100BodyGoal {
  weightGoalKg: number | null;
  startWeightKg: number | null;
  heightCm: number | null;
}

export interface Project100BodyMilestone {
  weightKg: number;
  reachedOn: string | null;
}

export interface Project100WeightPoint {
  measuredOn: string;
  value: number;
}

export interface Project100BodyJourney {
  today: string;
  from: string;
  to: string;
  entries: Project100BodyEntry[];
  goal: Project100BodyGoal;
  /** Every weight ever logged, oldest first. Milestones need the whole road. */
  weightHistory: Project100WeightPoint[];
}

export interface Project100MetricSeries {
  metric: string;
  label: string;
  unit: Project100MeasurementUnit;
  points: Project100WeightPoint[];
}

export function measurementOf(
  entry: Project100BodyEntry,
  metric: string,
): Project100BodyMeasurement | null {
  return entry.measurements.find((item) => item.metric === metric) ?? null;
}

/**
 * Turns the logged days into one line per measured thing, oldest first, so a
 * chart and a table can read from the same numbers.
 */
export function buildProject100MetricSeries(
  entries: Project100BodyEntry[],
): Project100MetricSeries[] {
  const series = new Map<string, Project100MetricSeries>();
  const ordered = [...entries].sort((left, right) =>
    left.measuredOn.localeCompare(right.measuredOn),
  );
  for (const entry of ordered) {
    for (const measurement of entry.measurements) {
      const existing = series.get(measurement.metric) ?? {
        metric: measurement.metric,
        label: measurement.label,
        unit: measurement.unit,
        points: [],
      };
      existing.points.push({ measuredOn: entry.measuredOn, value: measurement.value });
      series.set(measurement.metric, existing);
    }
  }
  const knownOrder = PROJECT100_KNOWN_METRICS.map((definition) => definition.metric);
  return [...series.values()].sort((left, right) => {
    const leftIndex = knownOrder.indexOf(left.metric);
    const rightIndex = knownOrder.indexOf(right.metric);
    if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
    if (leftIndex !== -1) return -1;
    if (rightIndex !== -1) return 1;
    return left.label.localeCompare(right.label, "sv-SE");
  });
}

function milestoneStep(distance: number): number {
  for (const step of [2.5, 5, 10]) {
    if (distance / step <= 8) return step;
  }
  return Math.ceil(distance / 8);
}

/**
 * The rungs between where the journey started and where it is going.
 *
 * A milestone is marked reached the first day a logged weight passed it, and
 * never un-marked afterwards: the road was walked even if the weight later
 * moved back.
 */
export function buildProject100Milestones(
  history: Project100WeightPoint[],
  goal: Project100BodyGoal,
): Project100BodyMilestone[] {
  const goalWeight = goal.weightGoalKg;
  const start = goal.startWeightKg ?? history[0]?.value ?? null;
  if (goalWeight === null || start === null || Math.abs(goalWeight - start) < 0.5) {
    return [];
  }

  const gaining = goalWeight > start;
  const step = milestoneStep(Math.abs(goalWeight - start));
  const rungs: number[] = [];
  if (gaining) {
    let next = Math.ceil(start / step) * step;
    if (next <= start + 0.001) next += step;
    for (; next < goalWeight - 0.001; next += step) rungs.push(Math.round(next * 10) / 10);
  } else {
    let next = Math.floor(start / step) * step;
    if (next >= start - 0.001) next -= step;
    for (; next > goalWeight + 0.001; next -= step) rungs.push(Math.round(next * 10) / 10);
  }
  rungs.push(Math.round(goalWeight * 10) / 10);

  return rungs.map((weightKg) => ({
    weightKg,
    reachedOn:
      history.find((point) => (gaining ? point.value >= weightKg : point.value <= weightKg))
        ?.measuredOn ?? null,
  }));
}

export function formatMeasurement(value: number, unit: Project100MeasurementUnit): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} ${unit}`;
}

export function formatDelta(value: number, unit: Project100MeasurementUnit): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} ${unit}`;
}

export interface Project100JourneyProgress {
  startWeightKg: number | null;
  currentWeightKg: number | null;
  goalWeightKg: number | null;
  progressPercent: number | null;
  weightDeltaKg: number | null;
  remainingKg: number | null;
}

export function calculateJourneyProgress(
  weightHistory: Project100WeightPoint[],
  goal: Project100BodyGoal,
): Project100JourneyProgress {
  const start = goal.startWeightKg ?? weightHistory[0]?.value ?? null;
  const current = weightHistory.at(-1)?.value ?? null;
  const target = goal.weightGoalKg;

  if (start === null || current === null || target === null || start === target) {
    return {
      startWeightKg: start,
      currentWeightKg: current,
      goalWeightKg: target,
      progressPercent: null,
      weightDeltaKg: current !== null && start !== null ? Math.round((current - start) * 10) / 10 : null,
      remainingKg: current !== null && target !== null ? Math.round(Math.abs(target - current) * 10) / 10 : null,
    };
  }

  const totalDistance = Math.abs(target - start);
  const coveredDistance = Math.abs(current - start);
  const isMovingTowards = target > start ? current >= start : current <= start;
  const rawPercent = isMovingTowards ? (coveredDistance / totalDistance) * 100 : 0;
  const progressPercent = Math.max(0, Math.min(100, Math.round(rawPercent * 10) / 10));

  return {
    startWeightKg: start,
    currentWeightKg: current,
    goalWeightKg: target,
    progressPercent,
    weightDeltaKg: Math.round((current - start) * 10) / 10,
    remainingKg: Math.round(Math.abs(target - current) * 10) / 10,
  };
}

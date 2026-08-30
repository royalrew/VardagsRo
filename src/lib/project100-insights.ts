import { addCalendarDateDays, calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";

export type Project100InsightPeriodPreset = "30d" | "90d" | "180d" | "year" | "custom";

export interface Project100MetricDelta {
  current: number | null;
  previous: number | null;
  change: number | null;
  changePercent: number | null;
}

export interface Project100MetricChange {
  metric: string;
  label: string;
  unit: string;
  startValue: number;
  endValue: number;
  delta: number;
}

export interface Project100BodyInsights {
  startWeightKg: number | null;
  endWeightKg: number | null;
  minWeightKg: number | null;
  maxWeightKg: number | null;
  weightDelta: Project100MetricDelta;
  measurementCount: number;
  metricChanges: Project100MetricChange[];
}

export interface Project100ActivityStat {
  activityType: string;
  label: string;
  count: number;
  minutes: number;
}

export interface Project100MuscleGroupStat {
  muscleGroup: string;
  label: string;
  sets: number;
}

export interface Project100TrainingInsights {
  completedSessions: Project100MetricDelta;
  totalMinutes: Project100MetricDelta;
  totalVolumeKg: Project100MetricDelta;
  activityBreakdown: Project100ActivityStat[];
  personalBestsCount: number;
  muscleGroupSets: Project100MuscleGroupStat[];
  uncategorizedSets: number;
}

export interface Project100NutritionInsights {
  averageProteinG: Project100MetricDelta;
  averageKcal: Project100MetricDelta;
  proteinTargetHitDays: number;
  loggedDaysCount: number;
  proteinTargetCoverageRate: number | null; // 0.0 - 1.0 (e.g. 0.85 = 85%)
  totalMealsLogged: number;
  batchesCooked: number;
}

export interface Project100RecoveryInsights {
  averageSleepHours: Project100MetricDelta;
  averageEnergy: Project100MetricDelta;
  averageMood: Project100MetricDelta;
  loggedDaysCount: number;
}

export interface Project100WorkComparison {
  workDaysCount: number;
  offDaysCount: number;
  workHoursTotal: number;
  sessionsOnWorkDays: number;
  sessionsOnWorkDaysRate: number; // pass per arbetsdag
  sessionsOnOffDays: number;
  sessionsOnOffDaysRate: number; // pass per ledig dag
  averageSleepOnWorkDays: number | null;
  averageSleepOnOffDays: number | null;
  averageEnergyOnWorkDays: number | null;
  averageEnergyOnOffDays: number | null;
}

export interface Project100InsightsTimelinePoint {
  date: string;
  weightKg: number | null;
  trainingVolumeKg: number | null;
  trainingMinutes: number | null;
  hasCompletedSession: boolean;
  proteinG: number | null;
  kcal: number | null;
  sleepHours: number | null;
  energy: number | null;
  mood: number | null;
  isWorkDay: boolean;
  workHours: number;
}

export interface Project100InsightHighlight {
  kind: "positive" | "neutral" | "attention";
  title: string;
  detail: string;
}

export interface Project100InsightsSummary {
  period: Project100InsightPeriodPreset;
  from: string;
  to: string;
  compareFrom: string;
  compareTo: string;
  daysInPeriod: number;
  body: Project100BodyInsights;
  training: Project100TrainingInsights;
  nutrition: Project100NutritionInsights;
  recovery: Project100RecoveryInsights;
  workComparison: Project100WorkComparison;
  timeline: Project100InsightsTimelinePoint[];
  highlights: Project100InsightHighlight[];
}

export function computeMetricDelta(
  current: number | null,
  previous: number | null,
): Project100MetricDelta {
  if (current === null && previous === null) {
    return { current: null, previous: null, change: null, changePercent: null };
  }
  if (current === null || previous === null) {
    return { current, previous, change: null, changePercent: null };
  }
  const change = Math.round((current - previous) * 100) / 100;
  const changePercent =
    previous !== 0
      ? Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10
      : null;

  return {
    current: Math.round(current * 100) / 100,
    previous: Math.round(previous * 100) / 100,
    change,
    changePercent,
  };
}

export function resolveInsightPeriodDates(
  preset: Project100InsightPeriodPreset,
  customFrom?: string | null,
  customTo?: string | null,
  todayStr?: string,
): { from: string; to: string; compareFrom: string; compareTo: string; period: Project100InsightPeriodPreset } {
  const today = todayStr ?? calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);

  if (preset === "custom" && customFrom && customTo) {
    const from = customFrom <= customTo ? customFrom : customTo;
    const to = customFrom <= customTo ? customTo : customFrom;
    const days = dateDiffDays(from, to) + 1;
    const compareTo = addCalendarDateDays(from, -1);
    const compareFrom = addCalendarDateDays(compareTo, -(days - 1));
    return { from, to, compareFrom, compareTo, period: "custom" };
  }

  let days = 30;
  if (preset === "90d") days = 90;
  else if (preset === "180d") days = 180;
  else if (preset === "year") days = 365;
  else days = 30;

  const to = today;
  const from = addCalendarDateDays(to, -(days - 1));
  const compareTo = addCalendarDateDays(from, -1);
  const compareFrom = addCalendarDateDays(compareTo, -(days - 1));

  return {
    from,
    to,
    compareFrom,
    compareTo,
    period: preset === "custom" ? "30d" : preset,
  };
}

export function dateDiffDays(from: string, to: string): number {
  const fromTime = new Date(`${from}T00:00:00Z`).getTime();
  const toTime = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((toTime - fromTime) / (1000 * 60 * 60 * 24));
}

export function averageOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

export function generateInsightHighlights(
  body: Project100BodyInsights,
  training: Project100TrainingInsights,
  nutrition: Project100NutritionInsights,
  recovery: Project100RecoveryInsights,
  workComparison: Project100WorkComparison,
): Project100InsightHighlight[] {
  const highlights: Project100InsightHighlight[] = [];

  // Vikt- & kroppsutveckling
  if (body.weightDelta.change !== null) {
    if (body.weightDelta.change > 0) {
      highlights.push({
        kind: "positive",
        title: `Vikten har ökat med ${body.weightDelta.change.toLocaleString("sv-SE")} kg`,
        detail: `Från ${body.startWeightKg} kg till ${body.endWeightKg} kg över perioden (${body.measurementCount} invägningar).`,
      });
    } else if (body.weightDelta.change < 0) {
      highlights.push({
        kind: "neutral",
        title: `Vikten har minskat med ${Math.abs(body.weightDelta.change).toLocaleString("sv-SE")} kg`,
        detail: `Från ${body.startWeightKg} kg till ${body.endWeightKg} kg över perioden (${body.measurementCount} invägningar).`,
      });
    } else {
      highlights.push({
        kind: "neutral",
        title: `Stabil vikt på ${body.endWeightKg} kg`,
        detail: `Ingen nettoförändring i vikt under perioden (${body.measurementCount} invägningar).`,
      });
    }
  }

  // Träning & volym
  if (training.completedSessions.current !== null && training.completedSessions.current > 0) {
    const sessionChange = training.completedSessions.change;
    const vol = Math.round(training.totalVolumeKg.current ?? 0);
    highlights.push({
      kind: "positive",
      title: `${training.completedSessions.current} pass genomförda (${(vol / 1000).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} ton volym)`,
      detail:
        sessionChange !== null
          ? `${sessionChange >= 0 ? `+${sessionChange}` : sessionChange} pass jämfört med föregående period.`
          : `Totalt ${Math.round((training.totalMinutes.current ?? 0) / 60)} timmar aktiv träning.`,
    });
  } else {
    highlights.push({
      kind: "attention",
      title: "Inga genomförda pass registrerade",
      detail: "Logga dina träningspass för att följa volym, frekvens och styrkeutveckling över tid.",
    });
  }

  // Kost & proteintäckning
  if (nutrition.averageProteinG.current !== null) {
    const avgProtein = nutrition.averageProteinG.current;
    const coverage =
      nutrition.proteinTargetCoverageRate !== null
        ? `${Math.round(nutrition.proteinTargetCoverageRate * 100)}%`
        : null;
    highlights.push({
      kind: (nutrition.proteinTargetCoverageRate ?? 0) >= 0.7 ? "positive" : "neutral",
      title: `Snittprotein ${avgProtein} g per loggad dag`,
      detail: coverage
        ? `Proteintäckning på ${coverage} av de loggade dagarna.`
        : `${nutrition.totalMealsLogged} måltider loggade under perioden.`,
    });
  }

  // Sömn & återhämtning
  if (recovery.averageSleepHours.current !== null) {
    const sleep = recovery.averageSleepHours.current;
    highlights.push({
      kind: sleep >= 7 ? "positive" : sleep >= 6 ? "neutral" : "attention",
      title: `Genomsnittlig sömn: ${sleep.toLocaleString("sv-SE")} timmar`,
      detail: `Baserat på ${recovery.loggedDaysCount} loggade nätter i dagboken.`,
    });
  }

  // Arbetsdagar vs lediga dagar
  if (workComparison.workDaysCount > 0 && workComparison.offDaysCount > 0) {
    if (workComparison.sessionsOnWorkDaysRate > workComparison.sessionsOnOffDaysRate) {
      highlights.push({
        kind: "neutral",
        title: "Högre träningsfrekvens på arbetsdagar",
        detail: `Du tränar i snitt ${(workComparison.sessionsOnWorkDaysRate * 100).toFixed(0)}% av arbetsdagarna mot ${(workComparison.sessionsOnOffDaysRate * 100).toFixed(0)}% av lediga dagar.`,
      });
    } else {
      highlights.push({
        kind: "neutral",
        title: "Träningen koncentreras till lediga dagar",
        detail: `Du tränar i snitt ${(workComparison.sessionsOnOffDaysRate * 100).toFixed(0)}% av lediga dagar mot ${(workComparison.sessionsOnWorkDaysRate * 100).toFixed(0)}% av arbetsdagarna.`,
      });
    }
  }

  return highlights;
}

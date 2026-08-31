import "server-only";

import {
  addCalendarDateDays,
  calendarDateInTimeZone,
  DEFAULT_TIME_ZONE,
} from "@/lib/dates";
import { project100MetricLabel } from "@/lib/project100-body";
import {
  averageOf,
  computeMetricDelta,
  dateDiffDays,
  generateInsightHighlights,
  resolveInsightPeriodDates,
  type Project100ActivityStat,
  type Project100BodyInsights,
  type Project100InsightsSummary,
  type Project100InsightsTimelinePoint,
  type Project100MetricChange,
  type Project100MuscleGroupStat,
  type Project100NutritionInsights,
  type Project100RecoveryInsights,
  type Project100TrainingInsights,
  type Project100WorkComparison,
} from "@/lib/project100-insights";
import { PROJECT100_MUSCLE_GROUP_LABELS, type Project100MuscleGroup } from "@/lib/project100-strength";
import { PROJECT100_ACTIVITY_LABELS, type Project100ActivityType } from "@/lib/project100-training";
import type { ActorContext } from "@/server/authorization-types";
import { readyClient } from "@/server/database";
import { assertProject100Adult } from "@/server/project100";
import type { Project100InsightsQuery } from "@/server/project100-insights-schemas";

interface BodyMeasurementRow {
  measured_on: string;
  metric: string;
  label: string | null;
  unit: string;
  value: number | string;
}

interface SessionRow {
  id: string;
  session_date: string;
  activity_type: Project100ActivityType;
  duration_seconds: number | null;
}

interface SetRow {
  session_id: string;
  session_date: string;
  exercise_id: string;
  exercise_name: string;
  muscle_groups: string[] | null;
  actual_reps: number | null;
  actual_weight_kg: number | string | null;
  actual_duration_seconds: number | null;
}

interface MealRow {
  eaten_on: string;
  protein_g: number | string | null;
  kcal: number | string | null;
}

interface JournalRow {
  written_on: string;
  sleep_hours: number | string | null;
  energy: number | null;
  mood: number | null;
}

interface WorkEventRow {
  id: string;
  starts_at: string;
  ends_at: string;
}

function asNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadProject100Insights(
  actor: ActorContext,
  query: Project100InsightsQuery,
): Promise<Project100InsightsSummary> {
  assertProject100Adult(actor);

  const sql = await readyClient();

  const householdRows = await sql<{ timezone: string }[]>`
    select timezone from family_households where id = ${actor.householdId} limit 1
  `;
  const timeZone = householdRows[0]?.timezone ?? DEFAULT_TIME_ZONE;
  const today = calendarDateInTimeZone(new Date(), timeZone);

  const { from, to, compareFrom, compareTo, period } = resolveInsightPeriodDates(
    query.period,
    query.from,
    query.to,
    today,
  );

  // Parallel multi-source fetch for active period AND comparative period
  const [
    curBodyRows,
    prevBodyRows,
    curSessionRows,
    prevSessionRows,
    curSetRows,
    prevSetRows,
    curMealRows,
    prevMealRows,
    curJournalRows,
    prevJournalRows,
    curBatches,
    curWorkEvents,
    settingsRows,
  ] = await Promise.all([
    // Body measurements (current)
    sql<BodyMeasurementRow[]>`
      select to_char(measured_on, 'YYYY-MM-DD') as measured_on, metric, label, unit, value
      from project100_body_measurements
      where user_id = ${actor.userId} and measured_on >= ${from} and measured_on <= ${to}
      order by measured_on asc, metric asc
    `,
    // Body measurements (previous)
    sql<BodyMeasurementRow[]>`
      select to_char(measured_on, 'YYYY-MM-DD') as measured_on, metric, label, unit, value
      from project100_body_measurements
      where user_id = ${actor.userId} and measured_on >= ${compareFrom} and measured_on <= ${compareTo}
      order by measured_on asc, metric asc
    `,
    // Completed training sessions (current)
    sql<SessionRow[]>`
      select id, to_char(session_date, 'YYYY-MM-DD') as session_date, activity_type, duration_seconds
      from project100_training_sessions
      where user_id = ${actor.userId} and status = 'completed'
        and session_date >= ${from} and session_date <= ${to}
      order by session_date asc
    `,
    // Completed training sessions (previous)
    sql<SessionRow[]>`
      select id, to_char(session_date, 'YYYY-MM-DD') as session_date, activity_type, duration_seconds
      from project100_training_sessions
      where user_id = ${actor.userId} and status = 'completed'
        and session_date >= ${compareFrom} and session_date <= ${compareTo}
    `,
    // Completed sets with muscle groups (current)
    sql<SetRow[]>`
      select s.id as session_id, to_char(s.session_date, 'YYYY-MM-DD') as session_date,
             e.id as exercise_id, e.name as exercise_name, e.muscle_groups,
             ts.actual_reps, ts.actual_weight_kg, ts.actual_duration_seconds
      from project100_training_sets ts
      join project100_training_exercises e on e.id = ts.exercise_id and e.user_id = ${actor.userId}
      join project100_training_sessions s on s.id = ts.session_id and s.user_id = ${actor.userId}
      where ts.user_id = ${actor.userId} and s.status = 'completed'
        and s.session_date >= ${from} and s.session_date <= ${to}
      order by s.session_date asc, ts.position asc
    `,
    // Completed sets (previous)
    sql<SetRow[]>`
      select s.id as session_id, to_char(s.session_date, 'YYYY-MM-DD') as session_date,
             e.id as exercise_id, e.name as exercise_name, e.muscle_groups,
             ts.actual_reps, ts.actual_weight_kg, ts.actual_duration_seconds
      from project100_training_sets ts
      join project100_training_exercises e on e.id = ts.exercise_id and e.user_id = ${actor.userId}
      join project100_training_sessions s on s.id = ts.session_id and s.user_id = ${actor.userId}
      where ts.user_id = ${actor.userId} and s.status = 'completed'
        and s.session_date >= ${compareFrom} and s.session_date <= ${compareTo}
    `,
    // Meals (current)
    sql<MealRow[]>`
      select to_char(eaten_on, 'YYYY-MM-DD') as eaten_on, protein_g, kcal
      from project100_meals
      where user_id = ${actor.userId} and eaten_on >= ${from} and eaten_on <= ${to}
      order by eaten_on asc
    `,
    // Meals (previous)
    sql<MealRow[]>`
      select to_char(eaten_on, 'YYYY-MM-DD') as eaten_on, protein_g, kcal
      from project100_meals
      where user_id = ${actor.userId} and eaten_on >= ${compareFrom} and eaten_on <= ${compareTo}
    `,
    // Journal (current)
    sql<JournalRow[]>`
      select to_char(written_on, 'YYYY-MM-DD') as written_on, sleep_hours, energy, mood
      from project100_journal_entries
      where user_id = ${actor.userId} and written_on >= ${from} and written_on <= ${to}
      order by written_on asc
    `,
    // Journal (previous)
    sql<JournalRow[]>`
      select to_char(written_on, 'YYYY-MM-DD') as written_on, sleep_hours, energy, mood
      from project100_journal_entries
      where user_id = ${actor.userId} and written_on >= ${compareFrom} and written_on <= ${compareTo}
    `,
    // Batches cooked in current period
    sql<{ count: number }[]>`
      select count(*)::int as count
      from project100_meal_batches
      where user_id = ${actor.userId} and cooked_on >= ${from} and cooked_on <= ${to}
    `,
    // Work events from family_events for actor in period
    sql<WorkEventRow[]>`
      select id, starts_at, ends_at
      from family_events
      where household_id = ${actor.householdId}
        and person_id = ${actor.personId}
        and category = 'work'
        and status = 'confirmed'
        and starts_at < ${addCalendarDateDays(to, 1)}::date
        and ends_at > ${from}::date
      order by starts_at asc
    `,
    // Settings for protein target
    sql<{ protein_target_g: number | string | null }[]>`
      select protein_target_g
      from project100_settings
      where user_id = ${actor.userId}
      limit 1
    `,
  ]);

  // 1. Body Insights
  const curWeights = curBodyRows
    .filter((r) => r.metric === "weight")
    .map((r) => asNumber(r.value))
    .filter((v): v is number => v !== null);
  const prevWeights = prevBodyRows
    .filter((r) => r.metric === "weight")
    .map((r) => asNumber(r.value))
    .filter((v): v is number => v !== null);

  const startWeight = curWeights[0] ?? null;
  const endWeight = curWeights[curWeights.length - 1] ?? null;
  const prevEndWeight = prevWeights[prevWeights.length - 1] ?? null;
  const weightDelta = computeMetricDelta(endWeight, prevEndWeight ?? startWeight);

  // Group other body metrics (waist, chest, arms, etc.)
  const metricsMap = new Map<string, { label: string; unit: string; values: number[] }>();
  for (const row of curBodyRows) {
    if (row.metric === "weight") continue;
    const val = asNumber(row.value);
    if (val === null) continue;
    if (!metricsMap.has(row.metric)) {
      metricsMap.set(row.metric, {
        label: project100MetricLabel(row.metric, row.label),
        unit: row.unit,
        values: [],
      });
    }
    metricsMap.get(row.metric)!.values.push(val);
  }

  const metricChanges: Project100MetricChange[] = [];
  for (const [metric, data] of metricsMap.entries()) {
    if (data.values.length >= 2) {
      const s = data.values[0];
      const e = data.values[data.values.length - 1];
      metricChanges.push({
        metric,
        label: data.label,
        unit: data.unit,
        startValue: s,
        endValue: e,
        delta: Math.round((e - s) * 10) / 10,
      });
    }
  }

  const bodyInsights: Project100BodyInsights = {
    startWeightKg: startWeight,
    endWeightKg: endWeight,
    minWeightKg: curWeights.length ? Math.min(...curWeights) : null,
    maxWeightKg: curWeights.length ? Math.max(...curWeights) : null,
    weightDelta,
    measurementCount: curWeights.length,
    metricChanges,
  };

  // 2. Training Insights
  const curSessionCount = curSessionRows.length;
  const prevSessionCount = prevSessionRows.length;
  const curMinutes = Math.round(
    curSessionRows.reduce((acc, s) => acc + (s.duration_seconds ? s.duration_seconds / 60 : 0), 0),
  );
  const prevMinutes = Math.round(
    prevSessionRows.reduce((acc, s) => acc + (s.duration_seconds ? s.duration_seconds / 60 : 0), 0),
  );

  function calculateVolume(sets: SetRow[]): number {
    return sets.reduce((sum, s) => {
      const reps = s.actual_reps ?? 0;
      const weight = asNumber(s.actual_weight_kg) ?? 0;
      return reps > 0 && weight > 0 ? sum + reps * weight : sum;
    }, 0);
  }

  const curVolume = calculateVolume(curSetRows);
  const prevVolume = calculateVolume(prevSetRows);

  const activityMap = new Map<string, { count: number; minutes: number }>();
  for (const s of curSessionRows) {
    const mins = Math.round((s.duration_seconds ?? 0) / 60);
    const existing = activityMap.get(s.activity_type) ?? { count: 0, minutes: 0 };
    activityMap.set(s.activity_type, {
      count: existing.count + 1,
      minutes: existing.minutes + mins,
    });
  }
  const activityBreakdown: Project100ActivityStat[] = [...activityMap.entries()].map(
    ([type, data]) => ({
      activityType: type,
      label: PROJECT100_ACTIVITY_LABELS[type as Project100ActivityType] ?? type,
      count: data.count,
      minutes: data.minutes,
    }),
  );

  // Muscle group breakdown
  const muscleMap = new Map<string, number>();
  let uncategorizedSets = 0;
  for (const s of curSetRows) {
    const reps = s.actual_reps ?? 0;
    const dur = s.actual_duration_seconds ?? 0;
    if (reps === 0 && dur === 0) continue; // Skip empty set
    if (!s.muscle_groups || s.muscle_groups.length === 0) {
      uncategorizedSets++;
    } else {
      for (const m of s.muscle_groups) {
        muscleMap.set(m, (muscleMap.get(m) ?? 0) + 1);
      }
    }
  }
  const muscleGroupSets: Project100MuscleGroupStat[] = [...muscleMap.entries()].map(
    ([mg, count]) => ({
      muscleGroup: mg,
      label: PROJECT100_MUSCLE_GROUP_LABELS[mg as Project100MuscleGroup] ?? mg,
      sets: count,
    }),
  );

  const trainingInsights: Project100TrainingInsights = {
    completedSessions: computeMetricDelta(curSessionCount, prevSessionCount),
    totalMinutes: computeMetricDelta(curMinutes, prevMinutes),
    totalVolumeKg: computeMetricDelta(curVolume, prevVolume),
    activityBreakdown,
    personalBestsCount: 0, // PB counts can be extended or aggregated
    muscleGroupSets,
    uncategorizedSets,
  };

  // 3. Nutrition Insights
  const proteinTarget = asNumber(settingsRows[0]?.protein_target_g) ?? 160;

  // Group meals by day
  const mealsByDay = new Map<string, { protein: number; kcal: number; meals: number }>();
  for (const m of curMealRows) {
    const d = m.eaten_on;
    const current = mealsByDay.get(d) ?? { protein: 0, kcal: 0, meals: 0 };
    current.protein += asNumber(m.protein_g) ?? 0;
    current.kcal += asNumber(m.kcal) ?? 0;
    current.meals += 1;
    mealsByDay.set(d, current);
  }

  const prevMealsByDay = new Map<string, { protein: number; kcal: number }>();
  for (const m of prevMealRows) {
    const d = m.eaten_on;
    const current = prevMealsByDay.get(d) ?? { protein: 0, kcal: 0 };
    current.protein += asNumber(m.protein_g) ?? 0;
    current.kcal += asNumber(m.kcal) ?? 0;
    prevMealsByDay.set(d, current);
  }

  const curDayProteins = [...mealsByDay.values()].map((v) => v.protein);
  const curDayKcals = [...mealsByDay.values()].map((v) => v.kcal);
  const prevDayProteins = [...prevMealsByDay.values()].map((v) => v.protein);
  const prevDayKcals = [...prevMealsByDay.values()].map((v) => v.kcal);

  const avgProtein = averageOf(curDayProteins);
  const prevAvgProtein = averageOf(prevDayProteins);
  const avgKcal = averageOf(curDayKcals);
  const prevAvgKcal = averageOf(prevDayKcals);

  const proteinTargetHitDays = [...mealsByDay.values()].filter(
    (v) => v.protein >= proteinTarget,
  ).length;
  const loggedDaysCount = mealsByDay.size;
  const proteinTargetCoverageRate =
    loggedDaysCount > 0 ? Math.round((proteinTargetHitDays / loggedDaysCount) * 100) / 100 : null;

  const nutritionInsights: Project100NutritionInsights = {
    averageProteinG: computeMetricDelta(avgProtein, prevAvgProtein),
    averageKcal: computeMetricDelta(avgKcal, prevAvgKcal),
    proteinTargetHitDays,
    loggedDaysCount,
    proteinTargetCoverageRate,
    totalMealsLogged: curMealRows.length,
    batchesCooked: curBatches[0]?.count ?? 0,
  };

  // 4. Recovery & Journal Insights
  const curSleeps = curJournalRows
    .map((j) => asNumber(j.sleep_hours))
    .filter((v): v is number => v !== null);
  const prevSleeps = prevJournalRows
    .map((j) => asNumber(j.sleep_hours))
    .filter((v): v is number => v !== null);
  const curEnergies = curJournalRows
    .map((j) => j.energy)
    .filter((v): v is number => v !== null);
  const prevEnergies = prevJournalRows
    .map((j) => j.energy)
    .filter((v): v is number => v !== null);
  const curMoods = curJournalRows
    .map((j) => j.mood)
    .filter((v): v is number => v !== null);
  const prevMoods = prevJournalRows
    .map((j) => j.mood)
    .filter((v): v is number => v !== null);

  const recoveryInsights: Project100RecoveryInsights = {
    averageSleepHours: computeMetricDelta(averageOf(curSleeps), averageOf(prevSleeps)),
    averageEnergy: computeMetricDelta(averageOf(curEnergies), averageOf(prevEnergies)),
    averageMood: computeMetricDelta(averageOf(curMoods), averageOf(prevMoods)),
    loggedDaysCount: curJournalRows.length,
  };

  // 5. Work vs Off Comparison
  // Map work events to calendar days in timezone
  const workDaysSet = new Set<string>();
  const workHoursMap = new Map<string, number>();
  for (const ev of curWorkEvents) {
    const sDate = calendarDateInTimeZone(new Date(ev.starts_at), timeZone);
    const durationHours =
      (new Date(ev.ends_at).getTime() - new Date(ev.starts_at).getTime()) / (1000 * 60 * 60);
    workDaysSet.add(sDate);
    workHoursMap.set(sDate, (workHoursMap.get(sDate) ?? 0) + Math.max(0, durationHours));
  }

  // Count total days in current period
  const totalDays = dateDiffDays(from, to) + 1;
  const workDaysCount = workDaysSet.size;
  const offDaysCount = Math.max(0, totalDays - workDaysCount);
  const workHoursTotal = Math.round(
    [...workHoursMap.values()].reduce((sum, h) => sum + h, 0) * 10,
  ) / 10;

  // Correlate sessions, sleep and energy on work days vs off days
  let sessionsOnWorkDays = 0;
  let sessionsOnOffDays = 0;
  for (const s of curSessionRows) {
    if (workDaysSet.has(s.session_date)) {
      sessionsOnWorkDays++;
    } else {
      sessionsOnOffDays++;
    }
  }

  const sleepOnWorkDays: number[] = [];
  const sleepOnOffDays: number[] = [];
  const energyOnWorkDays: number[] = [];
  const energyOnOffDays: number[] = [];

  for (const j of curJournalRows) {
    const sleep = asNumber(j.sleep_hours);
    const isWork = workDaysSet.has(j.written_on);
    if (sleep !== null) {
      if (isWork) sleepOnWorkDays.push(sleep);
      else sleepOnOffDays.push(sleep);
    }
    if (j.energy !== null) {
      if (isWork) energyOnWorkDays.push(j.energy);
      else energyOnOffDays.push(j.energy);
    }
  }

  const workComparison: Project100WorkComparison = {
    workDaysCount,
    offDaysCount,
    workHoursTotal,
    sessionsOnWorkDays,
    sessionsOnWorkDaysRate:
      workDaysCount > 0 ? Math.round((sessionsOnWorkDays / workDaysCount) * 100) / 100 : 0,
    sessionsOnOffDays,
    sessionsOnOffDaysRate:
      offDaysCount > 0 ? Math.round((sessionsOnOffDays / offDaysCount) * 100) / 100 : 0,
    averageSleepOnWorkDays: averageOf(sleepOnWorkDays),
    averageSleepOnOffDays: averageOf(sleepOnOffDays),
    averageEnergyOnWorkDays: averageOf(energyOnWorkDays),
    averageEnergyOnOffDays: averageOf(energyOnOffDays),
  };

  // 6. Timeline Point Series (for daily charts)
  const timeline: Project100InsightsTimelinePoint[] = [];
  let runner = from;
  const journalByDate = new Map(curJournalRows.map((j) => [j.written_on, j]));
  const weightByDate = new Map(
    curBodyRows
      .filter((b) => b.metric === "weight")
      .map((b) => [b.measured_on, asNumber(b.value)]),
  );

  // Group volume by date
  const volumeByDate = new Map<string, number>();
  for (const s of curSetRows) {
    const reps = s.actual_reps ?? 0;
    const weight = asNumber(s.actual_weight_kg) ?? 0;
    if (reps > 0 && weight > 0) {
      volumeByDate.set(s.session_date, (volumeByDate.get(s.session_date) ?? 0) + reps * weight);
    }
  }

  // Group training minutes by date
  const minutesByDate = new Map<string, number>();
  const sessionCompletedSet = new Set<string>();
  for (const s of curSessionRows) {
    sessionCompletedSet.add(s.session_date);
    const mins = Math.round((s.duration_seconds ?? 0) / 60);
    minutesByDate.set(s.session_date, (minutesByDate.get(s.session_date) ?? 0) + mins);
  }

  while (runner <= to) {
    const j = journalByDate.get(runner);
    const m = mealsByDay.get(runner);
    const isWork = workDaysSet.has(runner);
    timeline.push({
      date: runner,
      weightKg: weightByDate.get(runner) ?? null,
      trainingVolumeKg: volumeByDate.get(runner) ?? null,
      trainingMinutes: minutesByDate.get(runner) ?? null,
      hasCompletedSession: sessionCompletedSet.has(runner),
      proteinG: m?.protein ?? null,
      kcal: m?.kcal ?? null,
      sleepHours: asNumber(j?.sleep_hours),
      energy: j?.energy ?? null,
      mood: j?.mood ?? null,
      isWorkDay: isWork,
      workHours: workHoursMap.get(runner) ?? 0,
    });
    runner = addCalendarDateDays(runner, 1);
  }

  // 7. Highlights
  const highlights = generateInsightHighlights(
    bodyInsights,
    trainingInsights,
    nutritionInsights,
    recoveryInsights,
    workComparison,
  );

  return {
    period,
    from,
    to,
    compareFrom,
    compareTo,
    daysInPeriod: totalDays,
    body: bodyInsights,
    training: trainingInsights,
    nutrition: nutritionInsights,
    recovery: recoveryInsights,
    workComparison,
    timeline,
    highlights,
  };
}

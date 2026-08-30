import type { Project100SessionStatus } from "@/lib/project100-training";

export const PROJECT100_MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "core",
  "glutes",
  "quadriceps",
  "hamstrings",
  "calves",
] as const;

export type Project100MuscleGroup = (typeof PROJECT100_MUSCLE_GROUPS)[number];

export const PROJECT100_MUSCLE_GROUP_LABELS: Record<Project100MuscleGroup, string> = {
  chest: "Bröst",
  back: "Rygg",
  shoulders: "Axlar",
  biceps: "Biceps",
  triceps: "Triceps",
  core: "Bål",
  glutes: "Säte",
  quadriceps: "Framsida lår",
  hamstrings: "Baksida lår",
  calves: "Vader",
};

export interface Project100StrengthPeriod {
  from: string;
  to: string;
}

/**
 * One stored set as read from the training domain. The builder remains
 * defensive about status and completion even though the production query
 * applies the same filters in SQL.
 */
export interface Project100StrengthSetSource {
  setId: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroups: Project100MuscleGroup[];
  sessionId: string;
  sessionTitle: string;
  sessionDate: string;
  sessionStatus: Project100SessionStatus;
  setCompleted: boolean;
  actualReps: number | null;
  actualWeightKg: number | null;
  actualDurationSeconds: number | null;
  actualDistanceMeters: number | null;
}

export interface Project100StrengthSetPerformance {
  reps: number;
  weightKg: number;
  volumeKg: number;
}

export interface Project100StrengthSessionSummary {
  sessionId: string;
  title: string;
  completedSets: number;
  totalReps: number | null;
  volumeKg: number | null;
  heaviestSet: Project100StrengthSetPerformance | null;
  topSet: Project100StrengthSetPerformance | null;
}

export interface Project100StrengthPoint {
  measuredOn: string;
  completedSets: number;
  totalReps: number | null;
  volumeKg: number | null;
  heaviestSet: Project100StrengthSetPerformance | null;
  topSet: Project100StrengthSetPerformance | null;
  isHeaviestSetPr: boolean;
  isRepsPr: boolean;
  isTopSetPr: boolean;
  sessions: Project100StrengthSessionSummary[];
}

export interface Project100StrengthRecord<T> {
  achievedOn: string;
  value: T;
  sessions: Array<{ sessionId: string; title: string }>;
}

export interface Project100StrengthCoverage {
  firstLoggedOn: string;
  lastLoggedOn: string;
  historicalCompletedSets: number;
  visibleCompletedSets: number;
  visibleDays: number;
  visibleWeightedSets: number;
}

export interface Project100StrengthExercise {
  exerciseId: string;
  name: string;
  muscleGroups: Project100MuscleGroup[];
  points: Project100StrengthPoint[];
  recordsAsOfTo: {
    heaviestSet: Project100StrengthRecord<Project100StrengthSetPerformance> | null;
    topReps: Project100StrengthRecord<number> | null;
    topSet: Project100StrengthRecord<Project100StrengthSetPerformance> | null;
  };
  coverage: Project100StrengthCoverage;
}

export interface Project100StrengthDevelopment extends Project100StrengthPeriod {
  exercises: Project100StrengthExercise[];
}

export interface Project100MuscleCoverageItem {
  muscleGroup: Project100MuscleGroup;
  label: string;
  completedSets: number;
  exerciseCount: number;
}

export interface Project100MuscleCoverage {
  groups: Project100MuscleCoverageItem[];
  unclassifiedSets: number;
  unclassifiedExerciseIds: string[];
}

interface EligibleSet extends Project100StrengthSetSource {
  actualReps: number | null;
  actualWeightKg: number | null;
  actualDurationSeconds: number | null;
  actualDistanceMeters: number | null;
}

interface Aggregate {
  completedSets: number;
  weightedSets: number;
  totalReps: number | null;
  volumeKg: number | null;
  heaviestSet: Project100StrengthSetPerformance | null;
  topSet: Project100StrengthSetPerformance | null;
}

function nonNegative(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

function setPerformance(set: EligibleSet): Project100StrengthSetPerformance | null {
  if (set.actualReps === null || set.actualWeightKg === null) return null;
  return {
    reps: set.actualReps,
    weightKg: set.actualWeightKg,
    volumeKg: set.actualReps * set.actualWeightKg,
  };
}

function heavier(
  left: Project100StrengthSetPerformance,
  right: Project100StrengthSetPerformance,
): Project100StrengthSetPerformance {
  if (right.weightKg !== left.weightKg) return right.weightKg > left.weightKg ? right : left;
  if (right.reps !== left.reps) return right.reps > left.reps ? right : left;
  return left;
}

function largerSetVolume(
  left: Project100StrengthSetPerformance,
  right: Project100StrengthSetPerformance,
): Project100StrengthSetPerformance {
  if (right.volumeKg !== left.volumeKg) return right.volumeKg > left.volumeKg ? right : left;
  return heavier(left, right);
}

function aggregate(sets: EligibleSet[]): Aggregate {
  let totalReps: number | null = null;
  let volumeKg: number | null = null;
  let weightedSets = 0;
  let heaviestSet: Project100StrengthSetPerformance | null = null;
  let topSet: Project100StrengthSetPerformance | null = null;

  for (const set of sets) {
    if (set.actualReps !== null) totalReps = (totalReps ?? 0) + set.actualReps;
    const performance = setPerformance(set);
    if (performance === null) continue;

    weightedSets += 1;
    volumeKg = (volumeKg ?? 0) + performance.volumeKg;
    if (performance.reps > 0 && performance.weightKg > 0) {
      heaviestSet = heaviestSet === null ? performance : heavier(heaviestSet, performance);
      topSet = topSet === null ? performance : largerSetVolume(topSet, performance);
    }
  }

  return {
    completedSets: sets.length,
    weightedSets,
    totalReps,
    volumeKg,
    heaviestSet,
    topSet,
  };
}

function sessionsFor(
  sets: EligibleSet[],
  predicate: (set: EligibleSet) => boolean = () => true,
): Array<{ sessionId: string; title: string }> {
  const sessions = new Map<string, { sessionId: string; title: string }>();
  for (const set of sets) {
    if (!predicate(set)) continue;
    sessions.set(set.sessionId, { sessionId: set.sessionId, title: set.sessionTitle });
  }
  return [...sessions.values()].sort((left, right) =>
    left.sessionId.localeCompare(right.sessionId),
  );
}

function sessionSummaries(sets: EligibleSet[]): Project100StrengthSessionSummary[] {
  const bySession = new Map<string, EligibleSet[]>();
  for (const set of sets) {
    const current = bySession.get(set.sessionId) ?? [];
    current.push(set);
    bySession.set(set.sessionId, current);
  }

  return [...bySession.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sessionId, sessionSets]) => {
      const summary = aggregate(sessionSets);
      return {
        sessionId,
        title: sessionSets[0].sessionTitle,
        completedSets: summary.completedSets,
        totalReps: summary.totalReps,
        volumeKg: summary.volumeKg,
        heaviestSet: summary.heaviestSet,
        topSet: summary.topSet,
      };
    });
}

function samePerformance(
  left: Project100StrengthSetPerformance | null,
  right: Project100StrengthSetPerformance,
): boolean {
  return (
    left !== null &&
    left.reps === right.reps &&
    left.weightKg === right.weightKg &&
    left.volumeKg === right.volumeKg
  );
}

/**
 * Builds one daily line per exercise. Rows before the visible period are
 * deliberately processed first: a short view must not turn its first point
 * into a false personal best merely because earlier history is hidden.
 */
export function buildProject100StrengthDevelopment(
  rows: Project100StrengthSetSource[],
  period: Project100StrengthPeriod,
): Project100StrengthDevelopment {
  const eligible = rows.flatMap<EligibleSet>((row) => {
    if (
      row.sessionStatus !== "completed" ||
      !row.setCompleted ||
      row.sessionDate > period.to
    ) {
      return [];
    }
    const actualReps = nonNegative(row.actualReps);
    const actualWeightKg = nonNegative(row.actualWeightKg);
    const actualDurationSeconds = nonNegative(row.actualDurationSeconds);
    const actualDistanceMeters = nonNegative(row.actualDistanceMeters);
    if (
      (actualReps ?? 0) <= 0 &&
      (actualDurationSeconds ?? 0) <= 0 &&
      (actualDistanceMeters ?? 0) <= 0
    ) {
      return [];
    }
    return [
      {
        ...row,
        actualReps,
        actualWeightKg,
        actualDurationSeconds,
        actualDistanceMeters,
      },
    ];
  });

  const byExercise = new Map<
    string,
    {
      name: string;
      muscleGroups: Project100MuscleGroup[];
      lastLoggedOn: string;
      days: Map<string, EligibleSet[]>;
    }
  >();
  for (const set of eligible) {
    const exercise = byExercise.get(set.exerciseId) ?? {
      name: set.exerciseName,
      muscleGroups: set.muscleGroups,
      lastLoggedOn: set.sessionDate,
      days: new Map<string, EligibleSet[]>(),
    };
    if (set.sessionDate >= exercise.lastLoggedOn) {
      exercise.name = set.exerciseName;
      exercise.muscleGroups = set.muscleGroups;
      exercise.lastLoggedOn = set.sessionDate;
    }
    const day = exercise.days.get(set.sessionDate) ?? [];
    day.push(set);
    exercise.days.set(set.sessionDate, day);
    byExercise.set(set.exerciseId, exercise);
  }

  const exercises = [...byExercise.entries()].map<Project100StrengthExercise>(
    ([exerciseId, exercise]) => {
      const days = [...exercise.days.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      );
      let priorWeight: number | null = null;
      let priorReps: number | null = null;
      let priorSetVolume: number | null = null;
      let heaviestRecord: Project100StrengthRecord<Project100StrengthSetPerformance> | null = null;
      let repsRecord: Project100StrengthRecord<number> | null = null;
      let topSetRecord: Project100StrengthRecord<Project100StrengthSetPerformance> | null = null;

      const scored = days.map(([measuredOn, sets]) => {
        const summary = aggregate(sets);
        const dayTopReps = sets.reduce<number | null>(
          (maximum, set) =>
            set.actualReps !== null && set.actualReps > 0
              ? Math.max(maximum ?? set.actualReps, set.actualReps)
              : maximum,
          null,
        );
        const isHeaviestSetPr =
          summary.heaviestSet !== null &&
          (priorWeight === null || summary.heaviestSet.weightKg > priorWeight);
        const isRepsPr =
          dayTopReps !== null && (priorReps === null || dayTopReps > priorReps);
        const isTopSetPr =
          summary.topSet !== null &&
          (priorSetVolume === null || summary.topSet.volumeKg > priorSetVolume);

        if (isHeaviestSetPr && summary.heaviestSet !== null) {
          heaviestRecord = {
            achievedOn: measuredOn,
            value: summary.heaviestSet,
            sessions: sessionsFor(sets, (set) => {
              const performance = setPerformance(set);
              return (
                performance !== null &&
                performance.reps > 0 &&
                performance.weightKg === summary.heaviestSet?.weightKg
              );
            }),
          };
        }
        if (isRepsPr && dayTopReps !== null) {
          repsRecord = {
            achievedOn: measuredOn,
            value: dayTopReps,
            sessions: sessionsFor(sets, (set) => set.actualReps === dayTopReps),
          };
        }
        if (isTopSetPr && summary.topSet !== null) {
          const topSet = summary.topSet;
          topSetRecord = {
            achievedOn: measuredOn,
            value: topSet,
            sessions: sessionsFor(sets, (set) =>
              samePerformance(setPerformance(set), topSet),
            ),
          };
        }

        if (summary.heaviestSet !== null) {
          priorWeight = Math.max(
            priorWeight ?? summary.heaviestSet.weightKg,
            summary.heaviestSet.weightKg,
          );
        }
        if (dayTopReps !== null) priorReps = Math.max(priorReps ?? dayTopReps, dayTopReps);
        if (summary.topSet !== null) {
          priorSetVolume = Math.max(
            priorSetVolume ?? summary.topSet.volumeKg,
            summary.topSet.volumeKg,
          );
        }

        const point: Project100StrengthPoint = {
          measuredOn,
          completedSets: summary.completedSets,
          totalReps: summary.totalReps,
          volumeKg: summary.volumeKg,
          heaviestSet: summary.heaviestSet,
          topSet: summary.topSet,
          isHeaviestSetPr,
          isRepsPr,
          isTopSetPr,
          sessions: sessionSummaries(sets),
        };
        return { point, weightedSets: summary.weightedSets };
      });

      const visible = scored.filter(
        ({ point }) => point.measuredOn >= period.from && point.measuredOn <= period.to,
      );
      const firstLoggedOn = days[0][0];
      const lastLoggedOn = days.at(-1)?.[0] ?? firstLoggedOn;

      return {
        exerciseId,
        name: exercise.name,
        muscleGroups: exercise.muscleGroups,
        points: visible.map(({ point }) => point),
        recordsAsOfTo: {
          heaviestSet: heaviestRecord,
          topReps: repsRecord,
          topSet: topSetRecord,
        },
        coverage: {
          firstLoggedOn,
          lastLoggedOn,
          historicalCompletedSets: days.reduce(
            (total, [, sets]) => total + sets.length,
            0,
          ),
          visibleCompletedSets: visible.reduce(
            (total, { point }) => total + point.completedSets,
            0,
          ),
          visibleDays: visible.length,
          visibleWeightedSets: visible.reduce(
            (total, { weightedSets }) => total + weightedSets,
            0,
          ),
        },
      };
    },
  );

  exercises.sort((left, right) => {
    const recent = right.coverage.lastLoggedOn.localeCompare(left.coverage.lastLoggedOn);
    if (recent !== 0) return recent;
    const name = left.name.localeCompare(right.name, "sv-SE");
    return name !== 0 ? name : left.exerciseId.localeCompare(right.exerciseId);
  });

  return { ...period, exercises };
}

/**
 * Counts exposure, not strength: one completed set contributes once to every
 * muscle group the user attached to that exercise. Raw kilograms are never
 * compared between unrelated movements.
 */
export function buildProject100MuscleCoverage(
  development: Project100StrengthDevelopment,
): Project100MuscleCoverage {
  const completedSets = new Map<Project100MuscleGroup, number>();
  const exercises = new Map<Project100MuscleGroup, Set<string>>();
  const unclassifiedExerciseIds: string[] = [];
  let unclassifiedSets = 0;

  for (const exercise of development.exercises) {
    const visibleSets = exercise.coverage.visibleCompletedSets;
    if (visibleSets === 0) continue;
    if (exercise.muscleGroups.length === 0) {
      unclassifiedSets += visibleSets;
      unclassifiedExerciseIds.push(exercise.exerciseId);
      continue;
    }
    for (const muscleGroup of new Set(exercise.muscleGroups)) {
      completedSets.set(muscleGroup, (completedSets.get(muscleGroup) ?? 0) + visibleSets);
      const groupExercises = exercises.get(muscleGroup) ?? new Set<string>();
      groupExercises.add(exercise.exerciseId);
      exercises.set(muscleGroup, groupExercises);
    }
  }

  return {
    groups: PROJECT100_MUSCLE_GROUPS.map((muscleGroup) => ({
      muscleGroup,
      label: PROJECT100_MUSCLE_GROUP_LABELS[muscleGroup],
      completedSets: completedSets.get(muscleGroup) ?? 0,
      exerciseCount: exercises.get(muscleGroup)?.size ?? 0,
    })),
    unclassifiedSets,
    unclassifiedExerciseIds: unclassifiedExerciseIds.sort(),
  };
}

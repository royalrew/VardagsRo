import { addCalendarDateDays, startOfCalendarWeek } from "@/lib/dates";

export const PROJECT100_ACTIVITY_TYPES = [
  "strength_home",
  "forest",
  "outdoor_gym",
  "running",
  "cycling",
  "spinning",
  "mobility",
  "other",
] as const;

export type Project100ActivityType = (typeof PROJECT100_ACTIVITY_TYPES)[number];

export const PROJECT100_SESSION_STATUSES = [
  "planned",
  "in_progress",
  "completed",
  "skipped",
] as const;

export type Project100SessionStatus = (typeof PROJECT100_SESSION_STATUSES)[number];

export interface Project100SetMetrics {
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  rpe: number | null;
}

export interface Project100TrainingSet {
  id: string;
  position: number;
  target: Project100SetMetrics | null;
  actual: Project100SetMetrics | null;
  completed: boolean;
}

export interface Project100TrainingExercise {
  id: string;
  exerciseId: string;
  name: string;
  position: number;
  notes: string | null;
  sets: Project100TrainingSet[];
}

export interface Project100TrainingSession {
  id: string;
  sourceTemplateId: string | null;
  title: string;
  activityType: Project100ActivityType;
  status: Project100SessionStatus;
  sessionDate: string;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  location: string | null;
  effort: number | null;
  bodyBefore: string | null;
  bodyAfter: string | null;
  notes: string | null;
  createdAt: string;
  exercises: Project100TrainingExercise[];
}

export interface Project100TrainingTemplateSet {
  id: string;
  position: number;
  target: Project100SetMetrics;
}

export interface Project100TrainingTemplateExercise {
  id: string;
  exerciseId: string;
  name: string;
  position: number;
  notes: string | null;
  sets: Project100TrainingTemplateSet[];
}

export interface Project100TrainingTemplate {
  id: string;
  name: string;
  activityType: Project100ActivityType;
  description: string | null;
  createdAt: string;
  exercises: Project100TrainingTemplateExercise[];
}

export interface Project100TrainingSummary {
  completedThisWeek: number;
  planned: number;
  durationMinutesThisWeek: number;
  distanceKmThisWeek: number;
  volumeKgThisWeek: number;
}

export interface Project100TrainingView {
  today: string;
  sessions: Project100TrainingSession[];
  templates: Project100TrainingTemplate[];
  summary: Project100TrainingSummary;
}

export const PROJECT100_ACTIVITY_LABELS: Record<Project100ActivityType, string> = {
  strength_home: "Styrka hemma",
  forest: "Skogen",
  outdoor_gym: "Utegym",
  running: "Löpning",
  cycling: "Cykling",
  spinning: "Spinning",
  mobility: "Rörlighet",
  other: "Annat",
};

function actualMetricTotal(
  session: Project100TrainingSession,
  key: "durationSeconds" | "distanceMeters",
): number {
  return session.exercises.reduce(
    (exerciseTotal, exercise) =>
      exerciseTotal +
      exercise.sets.reduce(
        (setTotal, set) => setTotal + (set.completed ? (set.actual?.[key] ?? 0) : 0),
        0,
      ),
    0,
  );
}

/** Derived every time; totals and records are never trusted client fields. */
export function buildProject100TrainingSummary(
  sessions: Project100TrainingSession[],
  today: string,
): Project100TrainingSummary {
  const weekStart = startOfCalendarWeek(today);
  const weekEnd = addCalendarDateDays(weekStart, 7);
  const completed = sessions.filter(
    (session) =>
      session.status === "completed" &&
      session.sessionDate >= weekStart &&
      session.sessionDate < weekEnd,
  );

  const durationSeconds = completed.reduce(
    (total, session) =>
      total + (session.durationSeconds ?? actualMetricTotal(session, "durationSeconds")),
    0,
  );
  const distanceMeters = completed.reduce(
    (total, session) => total + actualMetricTotal(session, "distanceMeters"),
    0,
  );
  const volumeKg = completed.reduce(
    (sessionTotal, session) =>
      sessionTotal +
      session.exercises.reduce(
        (exerciseTotal, exercise) =>
          exerciseTotal +
          exercise.sets.reduce(
            (setTotal, set) =>
              setTotal +
              (set.completed
                ? (set.actual?.reps ?? 0) * (set.actual?.weightKg ?? 0)
                : 0),
            0,
          ),
        0,
      ),
    0,
  );

  return {
    completedThisWeek: completed.length,
    planned: sessions.filter((session) => session.status === "planned").length,
    durationMinutesThisWeek: Math.round(durationSeconds / 60),
    distanceKmThisWeek: Math.round((distanceMeters / 1000) * 10) / 10,
    volumeKgThisWeek: Math.round(volumeKg),
  };
}

export function emptyProject100SetMetrics(): Project100SetMetrics {
  return {
    reps: null,
    weightKg: null,
    durationSeconds: null,
    distanceMeters: null,
    rpe: null,
  };
}

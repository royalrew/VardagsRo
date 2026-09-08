/**
 * project100-motion-bridge.ts
 *
 * Bridges Motion Lab workouts (programs and individual exercise sessions)
 * with the unified Project 100 Workout Memory and Database API.
 *
 * Guarantees zero data loss (Etapp U2 & U3), allowing seamless pause,
 * continuation in manual mode, or immediate logging to database history.
 */

import {
  WORKOUT_PROGRAMS,
  type ProgramSessionState,
  type ProgramId,
} from "./motion-programs";
import {
  EXERCISE_LIBRARY,
  type LibraryExerciseId,
} from "./motion-library";
import type { WorkoutSessionState } from "./motion-workout";
import {
  saveWorkoutMemorySnapshot,
  type WorkoutMemoryExercise,
  type WorkoutMemorySet,
  type WorkoutMemorySnapshot,
} from "./project100-workout-memory";
import type { Project100ActivityType } from "./project100-training";

function draftId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `set-${Math.random().toString(36).slice(2, 9)}`;
}

function getTodayCalendarDate(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" })
    .format(new Date());
}

/**
 * Converts an active or completed ProgramSessionState from Motion Lab
 * into a standard WorkoutMemorySnapshot for localStorage persistence.
 */
export function convertProgramSessionToMemorySnapshot(
  session: ProgramSessionState,
  sessionDateOverride?: string,
): WorkoutMemorySnapshot {
  const program = WORKOUT_PROGRAMS[session.programId];
  const sessionDate = sessionDateOverride ?? getTodayCalendarDate();
  const activityType: Project100ActivityType = "strength_home";

  const exercises: WorkoutMemoryExercise[] = (program?.exercises ?? []).map((progEx) => {
    const libItem = EXERCISE_LIBRARY[progEx.exerciseId as LibraryExerciseId];
    const exerciseName = libItem ? libItem.name : progEx.exerciseId;
    const completedForThisEx = session.completedSets.filter(
      (c) => c.exerciseId === progEx.exerciseId,
    );

    const sets: WorkoutMemorySet[] = Array.from({ length: progEx.sets }).map((_, idx) => {
      const setNumber = idx + 1;
      const completedRecord = completedForThisEx.find((c) => c.setNumber === setNumber);
      if (completedRecord) {
        return {
          id: draftId(),
          reps: progEx.isHoldDuration ? "" : String(completedRecord.repsAchieved),
          weightKg: "0",
          durationSeconds: progEx.isHoldDuration ? String(completedRecord.repsAchieved) : undefined,
          durationMinutes: "",
          distanceKm: "",
          rpe: completedRecord.rpe ? String(completedRecord.rpe) : "",
          done: true,
        };
      }
      return {
        id: draftId(),
        reps: progEx.isHoldDuration ? "" : String(progEx.reps),
        weightKg: "0",
        durationSeconds: progEx.isHoldDuration ? String(progEx.reps) : undefined,
        durationMinutes: "",
        distanceKm: "",
        rpe: "",
        done: false,
      };
    });

    return {
      id: draftId(),
      name: exerciseName,
      notes: libItem?.cues.action ?? "",
      sets,
    };
  });

  const completedCount = session.completedSets.length;
  const estimatedMin = completedCount > 0
    ? Math.max(1, Math.round((completedCount * 90) / 60))
    : (program?.estimatedMinutes ?? 20);

  return {
    type: "session",
    title: program?.title ?? "Styrketräning med kamera",
    activityType,
    sessionDate,
    startedAtMs: Date.now() - estimatedMin * 60 * 1000,
    updatedAtMs: Date.now(),
    durationMinutes: String(estimatedMin),
    location: "Hemma / TV",
    effort: "",
    bodyBefore: "",
    bodyAfter: "",
    notes: `Genomfört med rörelsemätning i Motion Lab (${program?.title ?? session.programId}).`,
    exercises,
  };
}

/**
 * Converts a Squat WorkoutSessionState from Motion Lab into a WorkoutMemorySnapshot.
 */
export function convertSquatSessionToMemorySnapshot(
  squatSession: WorkoutSessionState,
  sessionDateOverride?: string,
): WorkoutMemorySnapshot {
  const sessionDate = sessionDateOverride ?? getTodayCalendarDate();
  const targetSets = squatSession.config.targetSets;
  const targetReps = squatSession.config.targetRepsPerSet;

  const sets: WorkoutMemorySet[] = Array.from({ length: targetSets }).map((_, idx) => {
    const setSummary = squatSession.completedSets[idx];
    if (setSummary) {
      const rpeNum = setSummary.rpe === "easy" ? "5" : setSummary.rpe === "moderate" ? "7" : setSummary.rpe === "hard" ? "9" : "";
      return {
        id: draftId(),
        reps: String(setSummary.completedReps),
        weightKg: "0",
        durationMinutes: "",
        distanceKm: "",
        rpe: rpeNum,
        done: true,
      };
    }
    return {
      id: draftId(),
      reps: String(targetReps),
      weightKg: "0",
      durationMinutes: "",
      distanceKm: "",
      rpe: "",
      done: false,
    };
  });

  return {
    type: "session",
    title: "Knäböj i Motion Lab",
    activityType: "strength_home",
    sessionDate,
    startedAtMs: squatSession.startedAt ? Date.parse(squatSession.startedAt) : Date.now() - 15 * 60 * 1000,
    updatedAtMs: Date.now(),
    durationMinutes: "15",
    location: "Hemma / TV",
    effort: "7",
    bodyBefore: "",
    bodyAfter: "",
    notes: "Knäböjspass verifierat med rörelsemätning och datorseende i Motion Lab.",
    exercises: [
      {
        id: draftId(),
        name: "Knäböj",
        notes: "3 set knäböj med feedback på djup och tempo.",
        sets,
      },
    ],
  };
}

/**
 * Prepares a database payload conforming to project100SessionCreateSchema
 * for directly saving a completed ProgramSessionState to the backend.
 */
export function convertProgramSessionToApiPayload(
  session: ProgramSessionState,
  sessionDateOverride?: string,
) {
  const program = WORKOUT_PROGRAMS[session.programId];
  const sessionDate = sessionDateOverride ?? getTodayCalendarDate();
  const activityType: Project100ActivityType = "strength_home";

  // Only include exercises that have at least one completed set
  const exercisesWithSets = (program?.exercises ?? [])
    .map((progEx) => {
      const libItem = EXERCISE_LIBRARY[progEx.exerciseId as LibraryExerciseId];
      const exerciseName = libItem ? libItem.name : progEx.exerciseId;
      const completedForThisEx = session.completedSets.filter(
        (c) => c.exerciseId === progEx.exerciseId,
      );
      if (completedForThisEx.length === 0) return null;

      return {
        name: exerciseName,
        notes: null,
        sets: completedForThisEx.map((c) => ({
          reps: progEx.isHoldDuration ? null : c.repsAchieved,
          weightKg: null,
          durationSeconds: progEx.isHoldDuration ? c.repsAchieved : null,
          distanceMeters: null,
          rpe: c.rpe ?? null,
        })),
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  const completedCount = session.completedSets.length;
  const timestamps = session.completedSets
    .map((c) => (c.completedAt ? Date.parse(c.completedAt) : null))
    .filter((t): t is number => t !== null);
  const durationSeconds =
    timestamps.length >= 2
      ? Math.max(60, Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 1000))
      : completedCount > 0
      ? completedCount * 90
      : (program?.estimatedMinutes ?? 20) * 60;

  // Extract average RPE if recorded in sets, otherwise leave effort null (do not hardcode 7)
  const rpeValues = session.completedSets.map((c) => c.rpe).filter((r): r is number => typeof r === "number");
  const avgRpe = rpeValues.length > 0 ? Math.round(rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) : null;

  return {
    title: program?.title ?? "Styrketräning med kamera",
    activityType,
    status: "completed" as const,
    sessionDate,
    templateId: null,
    plannedStartAt: null,
    plannedEndAt: null,
    durationSeconds,
    location: "Hemma / TV",
    effort: avgRpe,
    bodyBefore: null,
    bodyAfter: null,
    notes: `Genomfört med rörelsemätning i Motion Lab (${program?.title ?? session.programId}).`,
    exercises: exercisesWithSets,
  };
}

/**
 * Prepares a database payload conforming to project100SessionCreateSchema
 * for directly saving a completed Squat session to the backend.
 */
export function convertSquatSessionToApiPayload(
  squatSession: WorkoutSessionState,
  sessionDateOverride?: string,
) {
  const sessionDate = sessionDateOverride ?? getTodayCalendarDate();
  const completedSets = squatSession.completedSets;
  const elapsedFromTimestamps =
    squatSession.startedAt && squatSession.completedAt
      ? Math.round((Date.parse(squatSession.completedAt) - Date.parse(squatSession.startedAt)) / 1000)
      : null;
  const setDurationsSum = completedSets.reduce(
    (sum, s) => sum + (s.durationMs ? Math.round(s.durationMs / 1000) : 0),
    0,
  );
  const totalDurationSeconds =
    elapsedFromTimestamps && elapsedFromTimestamps > 0
      ? elapsedFromTimestamps
      : setDurationsSum > 0
      ? setDurationsSum
      : completedSets.length * 60;

  const lastRpe = completedSets.length > 0 ? completedSets[completedSets.length - 1].rpe : null;
  const effort =
    lastRpe === "hard" ? 9 : lastRpe === "moderate" ? 7 : lastRpe === "easy" ? 5 : null;

  return {
    title: "Knäböj i Motion Lab",
    activityType: "strength_home" as const,
    status: "completed" as const,
    sessionDate,
    templateId: null,
    plannedStartAt: squatSession.startedAt ?? null,
    plannedEndAt: squatSession.completedAt ?? null,
    durationSeconds: totalDurationSeconds,
    location: "Hemma / TV",
    effort,
    bodyBefore: null,
    bodyAfter: null,
    notes: "Knäböjspass 3×10 verifierat med datorseende och rörelsemätning i Motion Lab.",
    exercises: [
      {
        name: "Knäböj",
        notes: null,
        sets: completedSets.map((s) => ({
          reps: s.completedReps,
          weightKg: null,
          durationSeconds: s.durationMs ? Math.round(s.durationMs / 1000) : null,
          distanceMeters: null,
          rpe: s.rpe === "easy" ? 5 : s.rpe === "moderate" ? 7 : s.rpe === "hard" ? 9 : null,
        })),
      },
    ],
  };
}

/**
 * Synchronizes the active program session into local WorkoutMemorySnapshot.
 */
export function syncProgramToWorkoutMemory(
  session: ProgramSessionState,
  sessionDateOverride?: string,
): void {
  saveWorkoutMemorySnapshot(convertProgramSessionToMemorySnapshot(session, sessionDateOverride));
}

/**
 * Synchronizes the active squat session into local WorkoutMemorySnapshot.
 */
export function syncSquatToWorkoutMemory(
  squatSession: WorkoutSessionState,
  sessionDateOverride?: string,
): void {
  saveWorkoutMemorySnapshot(convertSquatSessionToMemorySnapshot(squatSession, sessionDateOverride));
}

import type { Project100ActivityType } from "./project100-training";

export const WORKOUT_MEMORY_STORAGE_KEY = "p100:training:active_workout_snapshot:v1";
export const DEFAULT_WORKOUT_MEMORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (preserves honest pauses across days)

export interface WorkoutMemorySet {
  id: string;
  reps: string;
  weightKg: string;
  durationMinutes: string;
  durationSeconds?: string;
  distanceKm: string;
  rpe: string;
  done: boolean;
  actualReps?: string;
  actualDurationSeconds?: string;
  actualWeightKg?: string;
  actualRpe?: string;
}

/**
 * Formats the target or achieved metric of a workout set cleanly for display:
 * Handles hold times (e.g. "20 sek") vs reps (e.g. "10 reps") vs duration (e.g. "5 min").
 */
export function formatWorkoutSetTarget(set: WorkoutMemorySet): string {
  if (set.durationSeconds && set.durationSeconds.trim() && set.durationSeconds !== "0") {
    return `${set.durationSeconds} sek`;
  }
  if (set.reps && set.reps.trim() && set.reps !== "0") {
    return `${set.reps} reps`;
  }
  if (set.durationMinutes && set.durationMinutes.trim() && set.durationMinutes !== "0") {
    return `${set.durationMinutes} min`;
  }
  if (set.distanceKm && set.distanceKm.trim()) {
    return `${set.distanceKm} km`;
  }
  return "1 set";
}

export interface WorkoutMemoryExercise {
  id: string;
  name: string;
  notes?: string;
  sets: WorkoutMemorySet[];
}

export interface WorkoutMemorySnapshot {
  type: "plan" | "session";
  sessionId?: string | null;
  templateId?: string | null;
  title: string;
  activityType: Project100ActivityType;
  sessionDate: string;
  startedAtMs: number;
  updatedAtMs: number;
  durationMinutes: string;
  location: string;
  effort: string;
  bodyBefore: string;
  bodyAfter: string;
  notes: string;
  exercises: WorkoutMemoryExercise[];
}

export interface WorkoutSnapshotProgress {
  completedSets: number;
  totalSets: number;
  completedExercises: string[];
  remainingExercises: string[];
  currentExerciseName: string;
  isAllDone: boolean;
  progressSummary: string;
}

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }
  return null;
}

/**
 * Saves the active workout snapshot into localStorage.
 */
export function saveWorkoutMemorySnapshot(snapshot: WorkoutMemorySnapshot): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const toSave: WorkoutMemorySnapshot = {
      ...snapshot,
      updatedAtMs: Date.now(),
    };
    storage.setItem(WORKOUT_MEMORY_STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // Storage quota or disabled storage - fail gracefully
  }
}

/**
 * Loads the active workout snapshot from localStorage.
 * Automatically discards and clears expired snapshots (> 24h old by default) or corrupt data.
 */
export function loadWorkoutMemorySnapshot(
  maxAgeMs: number = DEFAULT_WORKOUT_MEMORY_MAX_AGE_MS,
): WorkoutMemorySnapshot | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(WORKOUT_MEMORY_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as WorkoutMemorySnapshot;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.exercises)) {
      clearWorkoutMemorySnapshot();
      return null;
    }

    const age = Date.now() - (parsed.updatedAtMs || 0);
    if (age > maxAgeMs) {
      clearWorkoutMemorySnapshot();
      return null;
    }

    return parsed;
  } catch {
    clearWorkoutMemorySnapshot();
    return null;
  }
}

/**
 * Completely clears the saved workout snapshot.
 */
export function clearWorkoutMemorySnapshot(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(WORKOUT_MEMORY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Calculates current workout progress from a snapshot.
 * Detects completed exercises (e.g. all sets done for pushups) and identifies the next pending exercise.
 */
export function getWorkoutSnapshotProgress(snapshot: WorkoutMemorySnapshot): WorkoutSnapshotProgress {
  let completedSets = 0;
  let totalSets = 0;
  const completedExercises: string[] = [];
  const remainingExercises: string[] = [];
  let currentExerciseName = "";

  for (const exercise of snapshot.exercises) {
    const exTotalSets = exercise.sets.length;
    const exCompletedSets = exercise.sets.filter((s) => s.done).length;

    completedSets += exCompletedSets;
    totalSets += exTotalSets;

    if (exTotalSets > 0 && exCompletedSets >= exTotalSets) {
      completedExercises.push(exercise.name);
    } else {
      remainingExercises.push(exercise.name);
      if (!currentExerciseName && exercise.name) {
        currentExerciseName = exercise.name;
      }
    }
  }

  const isAllDone = totalSets > 0 && completedSets >= totalSets;

  if (!currentExerciseName && remainingExercises.length > 0) {
    currentExerciseName = remainingExercises[0];
  } else if (!currentExerciseName && snapshot.exercises.length > 0) {
    currentExerciseName = snapshot.exercises[0].name;
  }

  let progressSummary = "";
  if (isAllDone) {
    progressSummary = `Alla ${totalSets} set klara! Redo att sparas.`;
  } else if (completedSets === 0) {
    progressSummary = `0 av ${totalSets} set klara · Börja med ${currentExerciseName}`;
  } else {
    const parts: string[] = [`${completedSets} av ${totalSets} set klara`];
    if (completedExercises.length > 0) {
      parts.push(`${completedExercises[completedExercises.length - 1]} klara`);
    }
    if (remainingExercises.length > 0) {
      parts.push(`${remainingExercises[0]} nästa`);
    }
    progressSummary = parts.join(" · ");
  }

  return {
    completedSets,
    totalSets,
    completedExercises,
    remainingExercises,
    currentExerciseName,
    isAllDone,
    progressSummary,
  };
}

/**
 * Formats a relative timestamp in natural Swedish.
 */
export function formatWorkoutSnapshotRelativeTime(
  timestampMs: number,
  nowMs: number = Date.now(),
): string {
  const diffMs = Math.max(0, nowMs - timestampMs);
  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));

  if (diffMinutes < 1) return "just nu";
  if (diffMinutes < 60) return `${diffMinutes} min sedan`;
  if (diffHours === 1) return "1 timme sedan";
  return `${diffHours} timmar sedan`;
}

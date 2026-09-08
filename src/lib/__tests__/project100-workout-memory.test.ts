import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearWorkoutMemorySnapshot,
  formatWorkoutSetTarget,
  formatWorkoutSnapshotRelativeTime,
  getWorkoutSnapshotProgress,
  loadWorkoutMemorySnapshot,
  saveWorkoutMemorySnapshot,
  WORKOUT_MEMORY_STORAGE_KEY,
  type WorkoutMemorySnapshot,
} from "../project100-workout-memory";

describe("project100-workout-memory: Snapshot Storage & Progress Tracking", () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    for (const key in mockStorage) {
      delete mockStorage[key];
    }
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        for (const key in mockStorage) {
          delete mockStorage[key];
        }
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sampleSnapshot: WorkoutMemorySnapshot = {
    type: "plan",
    sessionId: "session-123",
    title: "Helkropp hemma",
    activityType: "strength_home",
    sessionDate: "2026-09-08",
    startedAtMs: 1788937200000,
    updatedAtMs: 1788939000000,
    durationMinutes: "45",
    location: "Hemma",
    effort: "7",
    bodyBefore: "Pigg",
    bodyAfter: "",
    notes: "Körde på morgonen",
    exercises: [
      {
        id: "ex-1",
        name: "Armhävningar",
        sets: [
          { id: "s-1", reps: "10", weightKg: "0", durationMinutes: "", distanceKm: "", rpe: "7", done: true },
          { id: "s-2", reps: "10", weightKg: "0", durationMinutes: "", distanceKm: "", rpe: "7", done: true },
          { id: "s-3", reps: "10", weightKg: "0", durationMinutes: "", distanceKm: "", rpe: "8", done: true },
          { id: "s-4", reps: "10", weightKg: "0", durationMinutes: "", distanceKm: "", rpe: "8", done: true },
        ],
      },
      {
        id: "ex-2",
        name: "Knäböj",
        sets: [
          { id: "s-5", reps: "15", weightKg: "0", durationMinutes: "", distanceKm: "", rpe: "7", done: false },
          { id: "s-6", reps: "15", weightKg: "0", durationMinutes: "", distanceKm: "", rpe: "7", done: false },
          { id: "s-7", reps: "15", weightKg: "0", durationMinutes: "", distanceKm: "", rpe: "8", done: false },
          { id: "s-8", reps: "15", weightKg: "0", durationMinutes: "", distanceKm: "", rpe: "8", done: false },
        ],
      },
    ],
  };

  it("saves and reloads a valid workout memory snapshot", () => {
    saveWorkoutMemorySnapshot(sampleSnapshot);
    const loaded = loadWorkoutMemorySnapshot();

    expect(loaded).toBeDefined();
    expect(loaded?.sessionId).toBe("session-123");
    expect(loaded?.title).toBe("Helkropp hemma");
    expect(loaded?.exercises.length).toBe(2);
    expect(loaded?.exercises[0].name).toBe("Armhävningar");
    expect(loaded?.exercises[0].sets.every((s) => s.done)).toBe(true);
  });

  it("clears a workout memory snapshot", () => {
    saveWorkoutMemorySnapshot(sampleSnapshot);
    expect(loadWorkoutMemorySnapshot()).not.toBeNull();

    clearWorkoutMemorySnapshot();
    expect(loadWorkoutMemorySnapshot()).toBeNull();
    expect(mockStorage[WORKOUT_MEMORY_STORAGE_KEY]).toBeUndefined();
  });

  it("returns null if storage contains corrupted JSON", () => {
    mockStorage[WORKOUT_MEMORY_STORAGE_KEY] = "{ corrupted json ...";
    expect(loadWorkoutMemorySnapshot()).toBeNull();
  });

  it("preserves snapshot older than 24 hours to prevent losing work across days, and purges after maxAgeMs (7 days)", () => {
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    const dayOldSnapshot: WorkoutMemorySnapshot = {
      ...sampleSnapshot,
      updatedAtMs: twentyFiveHoursAgo,
    };
    mockStorage[WORKOUT_MEMORY_STORAGE_KEY] = JSON.stringify(dayOldSnapshot);

    // Should NOT be purged after 25 hours
    const retained = loadWorkoutMemorySnapshot();
    expect(retained).not.toBeNull();
    expect(retained?.title).toBe("Helkropp hemma");

    // Eight days old (> 7 days) should be purged
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const expiredSnapshot: WorkoutMemorySnapshot = {
      ...sampleSnapshot,
      updatedAtMs: eightDaysAgo,
    };
    mockStorage[WORKOUT_MEMORY_STORAGE_KEY] = JSON.stringify(expiredSnapshot);

    const loaded = loadWorkoutMemorySnapshot();
    expect(loaded).toBeNull();
    expect(mockStorage[WORKOUT_MEMORY_STORAGE_KEY]).toBeUndefined();
  });

  it("calculates accurate progress when pushups are done and squats remain", () => {
    const progress = getWorkoutSnapshotProgress(sampleSnapshot);

    expect(progress.completedSets).toBe(4);
    expect(progress.totalSets).toBe(8);
    expect(progress.currentExerciseName).toBe("Knäböj");
    expect(progress.completedExercises).toEqual(["Armhävningar"]);
    expect(progress.remainingExercises).toEqual(["Knäböj"]);
    expect(progress.progressSummary).toBe("4 av 8 set klara · Armhävningar klara · Knäböj nästa");
  });

  it("handles progress when no sets are done yet", () => {
    const unstartedSnapshot: WorkoutMemorySnapshot = {
      ...sampleSnapshot,
      exercises: sampleSnapshot.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) => ({ ...s, done: false })),
      })),
    };

    const progress = getWorkoutSnapshotProgress(unstartedSnapshot);
    expect(progress.completedSets).toBe(0);
    expect(progress.currentExerciseName).toBe("Armhävningar");
    expect(progress.progressSummary).toBe("0 av 8 set klara · Börja med Armhävningar");
  });

  it("handles progress when all sets are completed", () => {
    const finishedSnapshot: WorkoutMemorySnapshot = {
      ...sampleSnapshot,
      exercises: sampleSnapshot.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) => ({ ...s, done: true })),
      })),
    };

    const progress = getWorkoutSnapshotProgress(finishedSnapshot);
    expect(progress.completedSets).toBe(8);
    expect(progress.totalSets).toBe(8);
    expect(progress.isAllDone).toBe(true);
    expect(progress.progressSummary).toBe("Alla 8 set klara! Redo att sparas.");
  });

  it("formats relative time correctly in Swedish", () => {
    const now = Date.now();
    expect(formatWorkoutSnapshotRelativeTime(now - 30 * 1000, now)).toBe("just nu");
    expect(formatWorkoutSnapshotRelativeTime(now - 5 * 60 * 1000, now)).toBe("5 min sedan");
    expect(formatWorkoutSnapshotRelativeTime(now - 75 * 60 * 1000, now)).toBe("1 timme sedan");
    expect(formatWorkoutSnapshotRelativeTime(now - 140 * 60 * 1000, now)).toBe("2 timmar sedan");
  });

  it("formats workout set targets correctly without producing 0 min for hold seconds", () => {
    // 1. Isometric hold (e.g. 20s handstand hold or 45s plank)
    expect(formatWorkoutSetTarget({
      id: "1",
      reps: "20",
      weightKg: "0",
      durationMinutes: "",
      durationSeconds: "20",
      distanceKm: "",
      rpe: "",
      done: false,
    })).toBe("20 sek");

    // 2. Regular reps
    expect(formatWorkoutSetTarget({
      id: "2",
      reps: "10",
      weightKg: "0",
      durationMinutes: "",
      distanceKm: "",
      rpe: "",
      done: false,
    })).toBe("10 reps");

    // 3. Regular duration in minutes
    expect(formatWorkoutSetTarget({
      id: "3",
      reps: "",
      weightKg: "0",
      durationMinutes: "15",
      distanceKm: "",
      rpe: "",
      done: false,
    })).toBe("15 min");

    // 4. Distance
    expect(formatWorkoutSetTarget({
      id: "4",
      reps: "",
      weightKg: "0",
      durationMinutes: "",
      distanceKm: "5",
      rpe: "",
      done: false,
    })).toBe("5 km");
  });
});

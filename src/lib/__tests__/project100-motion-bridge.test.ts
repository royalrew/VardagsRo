import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WORKOUT_PROGRAMS,
  type ProgramSessionState,
} from "../motion-programs";
import type { WorkoutSessionState } from "../motion-workout";
import {
  convertProgramSessionToApiPayload,
  convertProgramSessionToMemorySnapshot,
  convertSquatSessionToApiPayload,
  convertSquatSessionToMemorySnapshot,
  syncProgramToWorkoutMemory,
  syncSquatToWorkoutMemory,
} from "../project100-motion-bridge";
import {
  loadWorkoutMemorySnapshot,
  WORKOUT_MEMORY_STORAGE_KEY,
} from "../project100-workout-memory";

describe("project100-motion-bridge: Motion Lab to Workout Memory & API Payload", () => {
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

  const sampleProgramSession: ProgramSessionState = {
    programId: "calisthenics-control",
    currentExerciseIndex: 1,
    currentSet: 2,
    phase: "active-set",
    activeExercise: WORKOUT_PROGRAMS["calisthenics-control"].exercises[1],
    restSecondsRemaining: 0,
    completedSets: [
      {
        exerciseId: "pike-pushup",
        setNumber: 1,
        repsAchieved: 8,
        rpe: 7,
        completedAt: "2026-09-08T10:05:00.000Z",
      },
      {
        exerciseId: "pike-pushup",
        setNumber: 2,
        repsAchieved: 8,
        rpe: 8,
        completedAt: "2026-09-08T10:07:00.000Z",
      },
      {
        exerciseId: "pike-pushup",
        setNumber: 3,
        repsAchieved: 8,
        rpe: 8,
        completedAt: "2026-09-08T10:09:00.000Z",
      },
      {
        exerciseId: "handstand-hold",
        setNumber: 1,
        repsAchieved: 20,
        rpe: 8,
        completedAt: "2026-09-08T10:12:00.000Z",
      },
    ],
  };

  const sampleSquatSession: WorkoutSessionState = {
    config: {
      targetSets: 3,
      targetRepsPerSet: 10,
      restDurationSeconds: 45,
    },
    status: "completed",
    currentSetIndex: 3,
    currentSetStartedAtMs: 1788937200000,
    restStartedAtMs: null,
    startedAt: "2026-09-08T10:00:00.000Z",
    completedAt: "2026-09-08T10:15:00.000Z",
    completedSets: [
      {
        setNumber: 1,
        targetReps: 10,
        completedReps: 10,
        fullReps: 10,
        halfReps: 0,
        averageRomPercent: 95,
        averageTempoNotation: "2-0-1",
        averageSymmetryScore: 92,
        primaryObservation: "Godkänt djup",
        durationMs: 32_000,
        startedAtMs: 1788937200000,
        completedAtMs: 1788937232000,
        repsList: [],
        rpe: "easy",
      },
      {
        setNumber: 2,
        targetReps: 10,
        completedReps: 10,
        fullReps: 10,
        halfReps: 0,
        averageRomPercent: 93,
        averageTempoNotation: "2-0-1",
        averageSymmetryScore: 90,
        primaryObservation: "Godkänt djup",
        durationMs: 34_000,
        startedAtMs: 1788937277000,
        completedAtMs: 1788937311000,
        repsList: [],
        rpe: "moderate",
      },
      {
        setNumber: 3,
        targetReps: 10,
        completedReps: 10,
        fullReps: 9,
        halfReps: 1,
        averageRomPercent: 90,
        averageTempoNotation: "2-0-1",
        averageSymmetryScore: 88,
        primaryObservation: "Bra kämpat i sista repetitionen",
        durationMs: 36_000,
        startedAtMs: 1788937356000,
        completedAtMs: 1788937392000,
        repsList: [],
        rpe: "hard",
      },
    ],
  };

  it("converts a program session into a WorkoutMemorySnapshot with correct done sets", () => {
    const snapshot = convertProgramSessionToMemorySnapshot(sampleProgramSession, "2026-09-08");

    expect(snapshot.type).toBe("session");
    expect(snapshot.title).toBe("Calisthenics & Handstand Control");
    expect(snapshot.activityType).toBe("strength_home");
    expect(snapshot.sessionDate).toBe("2026-09-08");
    expect(snapshot.location).toBe("Hemma / TV");

    // Total 3 exercises in calisthenics-control
    expect(snapshot.exercises.length).toBe(3);

    // Pike pushup has 3 sets, all 3 done
    const pikeEx = snapshot.exercises.find((e) => e.name.toLowerCase().includes("pik"));
    expect(pikeEx).toBeDefined();
    expect(pikeEx?.sets.length).toBe(3);
    expect(pikeEx?.sets.every((s) => s.done)).toBe(true);

    // Handstand hold has 3 sets, 1 done and 2 pending
    const handstandEx = snapshot.exercises.find((e) => e.name.toLowerCase().includes("handstående"));
    expect(handstandEx).toBeDefined();
    expect(handstandEx?.sets[0].done).toBe(true);
    expect(handstandEx?.sets[0].reps).toBe("20");
    expect(handstandEx?.sets[1].done).toBe(false);
    expect(handstandEx?.sets[2].done).toBe(false);

    // Plank has 3 sets, none done
    const plankEx = snapshot.exercises.find((e) => e.name.toLowerCase().includes("planka"));
    expect(plankEx).toBeDefined();
    expect(plankEx?.sets.every((s) => !s.done)).toBe(true);
  });

  it("converts a squat session into a WorkoutMemorySnapshot", () => {
    const snapshot = convertSquatSessionToMemorySnapshot(sampleSquatSession, "2026-09-08");

    expect(snapshot.title).toContain("Knäböj");
    expect(snapshot.activityType).toBe("strength_home");
    expect(snapshot.exercises.length).toBe(1);
    expect(snapshot.exercises[0].name).toBe("Knäböj");
    expect(snapshot.exercises[0].sets.length).toBe(3);
    expect(snapshot.exercises[0].sets.every((s) => s.done)).toBe(true);
    expect(snapshot.exercises[0].sets[0].reps).toBe("10");
    expect(snapshot.exercises[0].sets[0].rpe).toBe("5"); // easy -> ~5
    expect(snapshot.exercises[0].sets[2].rpe).toBe("9"); // hard -> ~9
  });

  it("converts program session into a valid API session payload for database storage", () => {
    const payload = convertProgramSessionToApiPayload(sampleProgramSession, "2026-09-08");

    expect(payload.status).toBe("completed");
    expect(payload.sessionDate).toBe("2026-09-08");
    expect(payload.activityType).toBe("strength_home");
    expect(payload.exercises.length).toBeGreaterThanOrEqual(2); // at least the exercises with completed sets
    expect(payload.exercises[0].sets.length).toBe(3);
    expect(payload.exercises[0].sets[0].reps).toBe(8);
  });

  it("converts squat session into a valid API session payload", () => {
    const payload = convertSquatSessionToApiPayload(sampleSquatSession, "2026-09-08");

    expect(payload.status).toBe("completed");
    expect(payload.title).toContain("Knäböj");
    expect(payload.exercises.length).toBe(1);
    expect(payload.exercises[0].sets.length).toBe(3);
    expect(payload.exercises[0].sets[0].reps).toBe(10);
    expect(payload.durationSeconds).toBe(15 * 60);
  });

  it("syncs program session to localStorage under WORKOUT_MEMORY_STORAGE_KEY", () => {
    syncProgramToWorkoutMemory(sampleProgramSession, "2026-09-08");
    const loaded = loadWorkoutMemorySnapshot();
    expect(loaded).not.toBeNull();
    expect(loaded?.title).toBe("Calisthenics & Handstand Control");
  });

  it("syncs squat session to localStorage under WORKOUT_MEMORY_STORAGE_KEY", () => {
    syncSquatToWorkoutMemory(sampleSquatSession, "2026-09-08");
    const loaded = loadWorkoutMemorySnapshot();
    expect(loaded).not.toBeNull();
    expect(loaded?.title).toContain("Knäböj");
  });
});

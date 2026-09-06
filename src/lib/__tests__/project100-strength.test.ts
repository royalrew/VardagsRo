import { describe, expect, it } from "vitest";

import {
  buildProject100MuscleCoverage,
  buildProject100StrengthDevelopment,
  type Project100StrengthSetSource,
} from "@/lib/project100-strength";

const PERIOD = { from: "2026-08-01", to: "2026-08-31" };

function set(
  overrides: Partial<Project100StrengthSetSource> = {},
): Project100StrengthSetSource {
  return {
    setId: "set-1",
    exerciseId: "exercise-bench",
    exerciseName: "Bänkpress",
    muscleGroups: [],
    sessionId: "session-1",
    sessionTitle: "Överkropp",
    sessionDate: "2026-08-10",
    sessionStatus: "completed",
    setCompleted: true,
    actualReps: 5,
    actualWeightKg: 70,
    actualDurationSeconds: null,
    actualDistanceMeters: null,
    ...overrides,
  };
}

describe("Projekt 100 strength development", () => {
  it("uses only completed actual sets and never treats a target or a plan as progress", () => {
    const result = buildProject100StrengthDevelopment(
      [
        set(),
        set({ setId: "planned", sessionStatus: "planned", actualReps: 12, actualWeightKg: 100 }),
        set({ setId: "unchecked", setCompleted: false, actualReps: 10, actualWeightKg: 90 }),
        set({ setId: "empty", actualReps: null, actualWeightKg: null }),
        set({ setId: "weight-only", actualReps: null, actualWeightKg: 100 }),
        set({ setId: "failed", actualReps: 0, actualWeightKg: 100 }),
      ],
      PERIOD,
    );

    expect(result.exercises[0].points[0]).toMatchObject({
      completedSets: 1,
      totalReps: 5,
      volumeKg: 350,
    });
  });

  it("keeps reps-only bodyweight work while leaving volume honestly unknown", () => {
    const result = buildProject100StrengthDevelopment(
      [set({ exerciseId: "pullup", exerciseName: "Chins", actualReps: 8, actualWeightKg: null })],
      PERIOD,
    );
    const point = result.exercises[0].points[0];

    expect(point).toMatchObject({
      completedSets: 1,
      totalReps: 8,
      volumeKg: null,
      heaviestSet: null,
      topSet: null,
      isRepsPr: true,
    });
  });

  it("counts duration-only work in muscle exposure without inventing reps or volume", () => {
    const result = buildProject100StrengthDevelopment(
      [
        set({
          exerciseId: "plank",
          exerciseName: "Planka",
          muscleGroups: ["core"],
          actualReps: null,
          actualWeightKg: null,
          actualDurationSeconds: 60,
        }),
      ],
      PERIOD,
    );

    expect(result.exercises[0].points[0]).toMatchObject({
      completedSets: 1,
      totalReps: null,
      volumeKg: null,
    });
    expect(buildProject100MuscleCoverage(result).groups).toContainEqual(
      expect.objectContaining({ muscleGroup: "core", completedSets: 1 }),
    );
  });

  it("groups stable exercise ids per day and keeps each contributing session traceable", () => {
    const result = buildProject100StrengthDevelopment(
      [
        set(),
        set({
          setId: "set-2",
          exerciseName: "Bänkpress med stång",
          sessionId: "session-2",
          sessionTitle: "Kvällspass",
          actualReps: 3,
          actualWeightKg: 80,
        }),
      ],
      PERIOD,
    );
    const exercise = result.exercises[0];

    expect(exercise).toMatchObject({ exerciseId: "exercise-bench", name: "Bänkpress med stång" });
    expect(exercise.points).toHaveLength(1);
    expect(exercise.points[0]).toMatchObject({
      completedSets: 2,
      totalReps: 8,
      volumeKg: 590,
      heaviestSet: { reps: 3, weightKg: 80, volumeKg: 240 },
      topSet: { reps: 5, weightKg: 70, volumeKg: 350 },
    });
    expect(exercise.points[0].sessions).toEqual([
      expect.objectContaining({ sessionId: "session-1", title: "Överkropp", volumeKg: 350 }),
      expect.objectContaining({ sessionId: "session-2", title: "Kvällspass", volumeKg: 240 }),
    ]);
  });

  it("seeds records with hidden history so the period does not invent a personal best", () => {
    const result = buildProject100StrengthDevelopment(
      [
        set({ sessionDate: "2026-07-10", actualReps: 6, actualWeightKg: 80 }),
        set({ sessionDate: "2026-08-10", actualReps: 5, actualWeightKg: 75 }),
      ],
      PERIOD,
    );
    const exercise = result.exercises[0];

    expect(exercise.points).toHaveLength(1);
    expect(exercise.points[0]).toMatchObject({
      isHeaviestSetPr: false,
      isRepsPr: false,
      isTopSetPr: false,
    });
    expect(exercise.recordsAsOfTo.heaviestSet).toMatchObject({
      achievedOn: "2026-07-10",
      value: { weightKg: 80, reps: 6, volumeKg: 480 },
    });
  });

  it("requires a strictly greater value and keeps the first achievement on a tie", () => {
    const result = buildProject100StrengthDevelopment(
      [
        set({ sessionDate: "2026-08-05", actualReps: 5, actualWeightKg: 80 }),
        set({ sessionDate: "2026-08-12", actualReps: 5, actualWeightKg: 80 }),
        set({ sessionDate: "2026-08-20", actualReps: 6, actualWeightKg: 80 }),
      ],
      PERIOD,
    );
    const [first, tied, improved] = result.exercises[0].points;

    expect(first).toMatchObject({ isHeaviestSetPr: true, isRepsPr: true, isTopSetPr: true });
    expect(tied).toMatchObject({ isHeaviestSetPr: false, isRepsPr: false, isTopSetPr: false });
    expect(improved).toMatchObject({
      isHeaviestSetPr: false,
      isRepsPr: true,
      isTopSetPr: true,
    });
    expect(result.exercises[0].recordsAsOfTo).toMatchObject({
      heaviestSet: { achievedOn: "2026-08-05" },
      topReps: { achievedOn: "2026-08-20", value: 6 },
      topSet: { achievedOn: "2026-08-20" },
    });
  });

  it("ignores future rows but retains historical exercises with no visible points", () => {
    const result = buildProject100StrengthDevelopment(
      [
        set({ exerciseId: "old", exerciseName: "Knäböj", sessionDate: "2026-07-01" }),
        set({ exerciseId: "future", exerciseName: "Marklyft", sessionDate: "2026-09-01" }),
      ],
      PERIOD,
    );

    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0]).toMatchObject({
      exerciseId: "old",
      points: [],
      coverage: {
        firstLoggedOn: "2026-07-01",
        lastLoggedOn: "2026-07-01",
        historicalCompletedSets: 1,
        visibleCompletedSets: 0,
        visibleDays: 0,
      },
    });
  });

  it("preserves decimal loads and reports weighted coverage without rounding", () => {
    const result = buildProject100StrengthDevelopment(
      [
        set({ setId: "a", actualReps: 3, actualWeightKg: 22.5 }),
        set({ setId: "b", actualReps: 4, actualWeightKg: null }),
      ],
      PERIOD,
    );

    expect(result.exercises[0].points[0]).toMatchObject({ totalReps: 7, volumeKg: 67.5 });
    expect(result.exercises[0].coverage.visibleWeightedSets).toBe(1);
  });

  it("builds muscle coverage from completed sets without comparing raw loads", () => {
    const development = buildProject100StrengthDevelopment(
      [
        set({ setId: "bench-1", muscleGroups: ["chest", "triceps"] }),
        set({ setId: "bench-2", muscleGroups: ["chest", "triceps"] }),
        set({
          setId: "curl",
          exerciseId: "exercise-curl",
          exerciseName: "Curl",
          muscleGroups: ["biceps"],
          actualReps: 12,
          actualWeightKg: 15,
        }),
        set({
          setId: "unknown",
          exerciseId: "exercise-unknown",
          exerciseName: "Egen övning",
          muscleGroups: [],
        }),
      ],
      PERIOD,
    );

    const coverage = buildProject100MuscleCoverage(development);

    expect(coverage.groups.find((group) => group.muscleGroup === "chest")).toMatchObject({
      completedSets: 2,
      exerciseCount: 1,
    });
    expect(coverage.groups.find((group) => group.muscleGroup === "triceps")).toMatchObject({
      completedSets: 2,
      exerciseCount: 1,
    });
    expect(coverage.groups.find((group) => group.muscleGroup === "biceps")).toMatchObject({
      completedSets: 1,
      exerciseCount: 1,
    });
    expect(coverage.unclassifiedSets).toBe(1);
    expect(coverage.unclassifiedExerciseIds).toEqual(["exercise-unknown"]);
  });
});

import { describe, expect, it } from "vitest";

import {
  buildProject100TrainingSummary,
  emptyProject100SetMetrics,
  type Project100SessionStatus,
  type Project100SetMetrics,
  type Project100TrainingSession,
} from "@/lib/project100-training";

function metrics(values: Partial<Project100SetMetrics>): Project100SetMetrics {
  return { ...emptyProject100SetMetrics(), ...values };
}

function session(
  overrides: Partial<Project100TrainingSession> & {
    id: string;
    sessionDate: string;
    status: Project100SessionStatus;
  },
): Project100TrainingSession {
  return {
    sourceTemplateId: null,
    title: "Pass",
    activityType: "strength_home",
    plannedStartAt: null,
    plannedEndAt: null,
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    location: null,
    effort: null,
    bodyBefore: null,
    bodyAfter: null,
    notes: null,
    createdAt: "2026-08-26T18:00:00.000Z",
    exercises: [],
    ...overrides,
  };
}

function exercise(
  id: string,
  sets: Array<{ target?: Project100SetMetrics; actual?: Project100SetMetrics }>,
): Project100TrainingSession["exercises"][number] {
  return {
    id,
    exerciseId: `library-${id}`,
    name: "Marklyft",
    position: 0,
    notes: null,
    sets: sets.map((set, position) => ({
      id: `${id}-set-${position}`,
      position,
      target: set.target ?? null,
      actual: set.actual ?? null,
      completed: set.actual !== undefined,
    })),
  };
}

// Onsdag i veckan som börjar måndag 2026-08-24.
const TODAY = "2026-08-26";

describe("Projekt 100 training summary", () => {
  it("counts only completed sessions inside the current calendar week", () => {
    const summary = buildProject100TrainingSummary(
      [
        session({ id: "in-week", sessionDate: "2026-08-24", status: "completed" }),
        session({ id: "week-end", sessionDate: "2026-08-30", status: "completed" }),
        session({ id: "last-week", sessionDate: "2026-08-23", status: "completed" }),
        session({ id: "next-week", sessionDate: "2026-08-31", status: "completed" }),
        session({ id: "skipped", sessionDate: "2026-08-25", status: "skipped" }),
      ],
      TODAY,
    );

    expect(summary.completedThisWeek).toBe(2);
  });

  it("counts every planned session, also outside the current week", () => {
    const summary = buildProject100TrainingSummary(
      [
        session({ id: "soon", sessionDate: "2026-08-27", status: "planned" }),
        session({ id: "later", sessionDate: "2026-09-14", status: "planned" }),
        session({ id: "done", sessionDate: "2026-08-25", status: "completed" }),
      ],
      TODAY,
    );

    expect(summary.planned).toBe(2);
  });

  it("prefers the session total time and falls back to the logged sets", () => {
    const summary = buildProject100TrainingSummary(
      [
        session({
          id: "with-total",
          sessionDate: "2026-08-25",
          status: "completed",
          durationSeconds: 2_700,
          exercises: [exercise("a", [{ actual: metrics({ durationSeconds: 600 }) }])],
        }),
        session({
          id: "sets-only",
          sessionDate: "2026-08-26",
          status: "completed",
          exercises: [
            exercise("b", [
              { actual: metrics({ durationSeconds: 300 }) },
              { actual: metrics({ durationSeconds: 300 }) },
            ]),
          ],
        }),
      ],
      TODAY,
    );

    expect(summary.durationMinutesThisWeek).toBe(55);
  });

  it("builds volume and distance from what happened, never from the plan", () => {
    const summary = buildProject100TrainingSummary(
      [
        session({
          id: "planned-heavy",
          sessionDate: "2026-08-25",
          status: "planned",
          exercises: [
            exercise("planned", [{ target: metrics({ reps: 10, weightKg: 100 }) }]),
          ],
        }),
        session({
          id: "actually-lighter",
          sessionDate: "2026-08-25",
          status: "completed",
          exercises: [
            exercise("done", [
              {
                target: metrics({ reps: 10, weightKg: 100 }),
                actual: metrics({ reps: 8, weightKg: 60 }),
              },
              { actual: metrics({ distanceMeters: 5_250 }) },
            ]),
          ],
        }),
      ],
      TODAY,
    );

    expect(summary.volumeKgThisWeek).toBe(480);
    expect(summary.distanceKmThisWeek).toBe(5.3);
  });

  it("does not count actual values from a set that was left unfinished", () => {
    const unfinished = exercise("unfinished", [
      { actual: metrics({ reps: 10, weightKg: 100, distanceMeters: 5_000 }) },
    ]);
    unfinished.sets[0].completed = false;

    const summary = buildProject100TrainingSummary(
      [
        session({
          id: "partly-done",
          sessionDate: "2026-08-26",
          status: "completed",
          exercises: [unfinished],
        }),
      ],
      TODAY,
    );

    expect(summary.volumeKgThisWeek).toBe(0);
    expect(summary.distanceKmThisWeek).toBe(0);
  });

  it("reports an honest zero week instead of guessing", () => {
    expect(buildProject100TrainingSummary([], TODAY)).toEqual({
      completedThisWeek: 0,
      planned: 0,
      durationMinutesThisWeek: 0,
      distanceKmThisWeek: 0,
      volumeKgThisWeek: 0,
    });
  });
});

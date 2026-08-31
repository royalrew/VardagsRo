import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  interface Call {
    text: string;
    values: unknown[];
  }

  const calls: Call[] = [];
  const state = {
    userId: "user-test",
    measurements: [] as {
      userId: string;
      measuredOn: string;
      metric: string;
      label: string | null;
      unit: string;
      value: number;
    }[],
    sessions: [] as {
      id: string;
      userId: string;
      sessionDate: string;
      activityType: string;
      status: string;
      durationSeconds: number;
    }[],
    sets: [] as {
      sessionId: string;
      userId: string;
      sessionDate: string;
      exerciseId: string;
      exerciseName: string;
      muscleGroups: string[] | null;
      actualReps: number | null;
      actualWeightKg: number | null;
      actualDurationSeconds: number | null;
    }[],
    meals: [] as {
      userId: string;
      eatenOn: string;
      proteinG: number;
      kcal: number;
    }[],
    journal: [] as {
      userId: string;
      writtenOn: string;
      sleepHours: number | null;
      energy: number | null;
      mood: number | null;
    }[],
    workEvents: [] as {
      id: string;
      startsAt: string;
      endsAt: string;
    }[],
  };

  function reset() {
    calls.length = 0;
    state.measurements = [
      {
        userId: "user-test",
        measuredOn: "2026-08-01",
        metric: "weight",
        label: null,
        unit: "kg",
        value: 82.0,
      },
      {
        userId: "user-test",
        measuredOn: "2026-08-30",
        metric: "weight",
        label: null,
        unit: "kg",
        value: 84.5,
      },
      {
        userId: "user-elsewhere",
        measuredOn: "2026-08-30",
        metric: "weight",
        label: null,
        unit: "kg",
        value: 99.0,
      },
    ];

    state.sessions = [
      {
        id: "session-1",
        userId: "user-test",
        sessionDate: "2026-08-10",
        activityType: "gym",
        status: "completed",
        durationSeconds: 3600,
      },
      {
        id: "session-2",
        userId: "user-test",
        sessionDate: "2026-08-15",
        activityType: "gym",
        status: "completed",
        durationSeconds: 3600,
      },
      {
        id: "session-other",
        userId: "user-elsewhere",
        sessionDate: "2026-08-15",
        activityType: "gym",
        status: "completed",
        durationSeconds: 3600,
      },
    ];

    state.sets = [
      {
        sessionId: "session-1",
        userId: "user-test",
        sessionDate: "2026-08-10",
        exerciseId: "ex-1",
        exerciseName: "Bänkpress",
        muscleGroups: ["chest", "triceps"],
        actualReps: 10,
        actualWeightKg: 80,
        actualDurationSeconds: null,
      },
      {
        sessionId: "session-2",
        userId: "user-test",
        sessionDate: "2026-08-15",
        exerciseId: "ex-1",
        exerciseName: "Bänkpress",
        muscleGroups: ["chest", "triceps"],
        actualReps: 10,
        actualWeightKg: 85,
        actualDurationSeconds: null,
      },
    ];

    state.meals = [
      {
        userId: "user-test",
        eatenOn: "2026-08-10",
        proteinG: 180,
        kcal: 2700,
      },
      {
        userId: "user-test",
        eatenOn: "2026-08-15",
        proteinG: 170,
        kcal: 2600,
      },
      {
        userId: "user-elsewhere",
        eatenOn: "2026-08-15",
        proteinG: 300,
        kcal: 4000,
      },
    ];

    state.journal = [
      {
        userId: "user-test",
        writtenOn: "2026-08-10",
        sleepHours: 7.5,
        energy: 4,
        mood: 4,
      },
      {
        userId: "user-test",
        writtenOn: "2026-08-15",
        sleepHours: 8.0,
        energy: 5,
        mood: 5,
      },
    ];

    state.workEvents = [
      {
        id: "work-1",
        startsAt: "2026-08-10T07:00:00Z",
        endsAt: "2026-08-10T16:00:00Z",
      },
    ];
  }

  async function execute(text: string, values: unknown[]) {
    if (text.includes("from family_households")) {
      return [{ timezone: "Europe/Stockholm" }];
    }

    if (text.includes("from project100_body_measurements")) {
      const userId = values[0] as string;
      const from = values[1] as string;
      const to = values[2] as string;
      return state.measurements
        .filter((m) => m.userId === userId && m.measuredOn >= from && m.measuredOn <= to)
        .map((m) => ({
          measured_on: m.measuredOn,
          metric: m.metric,
          label: m.label,
          unit: m.unit,
          value: m.value,
        }));
    }

    if (text.includes("from project100_training_sessions")) {
      const userId = values[0] as string;
      const from = values[1] as string;
      const to = values[2] as string;
      return state.sessions
        .filter((s) => s.userId === userId && s.sessionDate >= from && s.sessionDate <= to)
        .map((s) => ({
          id: s.id,
          session_date: s.sessionDate,
          activity_type: s.activityType,
          duration_seconds: s.durationSeconds,
        }));
    }

    if (text.includes("from project100_training_sets")) {
      const userId = values[0] as string;
      const from = values[3] as string;
      const to = values[4] as string;
      return state.sets
        .filter((s) => s.userId === userId && s.sessionDate >= from && s.sessionDate <= to)
        .map((s) => ({
          session_id: s.sessionId,
          session_date: s.sessionDate,
          exercise_id: s.exerciseId,
          exercise_name: s.exerciseName,
          muscle_groups: s.muscleGroups,
          actual_reps: s.actualReps,
          actual_weight_kg: s.actualWeightKg,
          actual_duration_seconds: s.actualDurationSeconds,
        }));
    }

    if (text.includes("from project100_meals")) {
      const userId = values[0] as string;
      const from = values[1] as string;
      const to = values[2] as string;
      return state.meals
        .filter((m) => m.userId === userId && m.eatenOn >= from && m.eatenOn <= to)
        .map((m) => ({
          eaten_on: m.eatenOn,
          protein_g: m.proteinG,
          kcal: m.kcal,
        }));
    }

    if (text.includes("from project100_journal_entries")) {
      const userId = values[0] as string;
      const from = values[1] as string;
      const to = values[2] as string;
      return state.journal
        .filter((j) => j.userId === userId && j.writtenOn >= from && j.writtenOn <= to)
        .map((j) => ({
          written_on: j.writtenOn,
          sleep_hours: j.sleepHours,
          energy: j.energy,
          mood: j.mood,
        }));
    }

    if (text.includes("from project100_meal_batches")) {
      return [{ count: 1 }];
    }

    if (text.includes("from family_events")) {
      return state.workEvents.map((w) => ({
        id: w.id,
        starts_at: w.startsAt,
        ends_at: w.endsAt,
      }));
    }

    if (text.includes("from project100_settings")) {
      return [{ protein_target_g: 170 }];
    }

    throw new Error(`Unexpected query in test: ${text}`);
  }

  function createTag() {
    return vi.fn((strings: TemplateStringsArray | unknown[], ...values: unknown[]) => {
      if (!("raw" in strings)) return { list: [...strings] };
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      calls.push({ text, values });
      return execute(text, values);
    });
  }

  const sql = createTag();
  reset();
  return { calls, reset, sql, state };
});

vi.mock("@/server/database", () => ({ readyClient: async () => database.sql }));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://project100.test/database",
  demoFallbackAllowed: () => false,
}));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: vi.fn() } }) }));

import { loadProject100Insights } from "@/server/project100-insights";

const CHILD = { ...TEST_ACTOR, personType: "child" as const };

describe("Project 100 Insights Server", () => {
  beforeEach(() => {
    database.reset();
  });

  it("denies access to non-adult actors before running any query", async () => {
    await expect(loadProject100Insights(CHILD, { period: "30d", from: null, to: null })).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
      status: 403,
    });
  });

  it("aggregates body, training, nutrition, recovery, and work comparison for the signed-in user", async () => {
    const result = await loadProject100Insights(TEST_ACTOR, {
      period: "custom",
      from: "2026-08-01",
      to: "2026-08-30",
    });

    // Body
    expect(result.body.startWeightKg).toBe(82.0);
    expect(result.body.endWeightKg).toBe(84.5);
    expect(result.body.weightDelta.change).toBe(2.5);
    expect(result.body.measurementCount).toBe(2);

    // Training (10 * 80 + 10 * 85 = 800 + 850 = 1650 kg)
    expect(result.training.completedSessions.current).toBe(2);
    expect(result.training.totalVolumeKg.current).toBe(1650);
    expect(result.training.muscleGroupSets.length).toBeGreaterThanOrEqual(2);

    // Nutrition
    expect(result.nutrition.averageProteinG.current).toBe(175);
    expect(result.nutrition.proteinTargetHitDays).toBe(2); // Both >= 170g target
    expect(result.nutrition.proteinTargetCoverageRate).toBe(1);

    // Recovery
    expect(result.recovery.averageSleepHours.current).toBe(7.75);
    expect(result.recovery.averageEnergy.current).toBe(4.5);

    // Work vs Off
    expect(result.workComparison.workDaysCount).toBe(1); // 2026-08-10 is a work day
    expect(result.workComparison.sessionsOnWorkDays).toBe(1);
    expect(result.workComparison.sessionsOnOffDays).toBe(1);

    // Timeline
    expect(result.timeline.length).toBe(30);
    const workDayPoint = result.timeline.find((t) => t.date === "2026-08-10");
    expect(workDayPoint?.isWorkDay).toBe(true);
    expect(workDayPoint?.proteinG).toBe(180);
    expect(workDayPoint?.trainingVolumeKg).toBe(800);

    // Highlights
    expect(result.highlights.length).toBeGreaterThanOrEqual(3);
  });
});

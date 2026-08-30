import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const rows: Array<Record<string, unknown>> = [];
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve(rows);
  });
  const begin = vi.fn(async (callback: (tx: typeof sql) => Promise<unknown>) => callback(sql));
  Object.assign(sql, { begin, json: (value: unknown) => value });
  return { begin, calls, rows, sql };
});

vi.mock("@/server/database", () => ({ readyClient: async () => database.sql }));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://project100.test/database",
  demoFallbackAllowed: () => false,
}));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: vi.fn() } }) }));

import {
  loadProject100StrengthDevelopment,
  saveProject100ExerciseMuscleGroups,
} from "@/server/project100-strength";

const CHILD = { ...TEST_ACTOR, personType: "child" as const };
const PERIOD = { from: "2026-08-01", to: "2026-08-31" };

function row(overrides: Record<string, unknown> = {}) {
  return {
    set_id: "set-1",
    exercise_id: "exercise-1",
    exercise_name: "Bänkpress",
    muscle_groups: ["chest", "triceps"],
    session_id: "session-1",
    session_title: "Överkropp",
    session_date: "2026-08-10",
    session_status: "completed",
    set_completed: true,
    actual_reps: 5,
    actual_weight_kg: "70.50",
    actual_duration_seconds: null,
    actual_distance_meters: null,
    ...overrides,
  };
}

describe("Projekt 100 strength storage", () => {
  beforeEach(() => {
    database.calls.length = 0;
    database.rows.length = 0;
    database.sql.mockClear();
    database.begin.mockClear();
  });

  it("keeps a child out before any strength row is read", async () => {
    await expect(loadProject100StrengthDevelopment(CHILD, PERIOD)).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
      status: 403,
    });
    expect(database.sql).not.toHaveBeenCalled();
  });

  it("scopes the session, exercise, set and library aliases to the signed-in account", async () => {
    await loadProject100StrengthDevelopment(TEST_ACTOR, PERIOD);
    const query = database.calls[0];

    for (const alias of ["s", "se", "ss", "e"]) {
      expect(query.text).toContain(`${alias}.user_id = ?`);
    }
    expect(query.values.filter((value) => value === TEST_ACTOR.userId)).toHaveLength(4);
  });

  it("reads only completed actual sets through the period end without a history limit", async () => {
    await loadProject100StrengthDevelopment(TEST_ACTOR, PERIOD);
    const query = database.calls[0];

    expect(query.text).toContain("s.status = 'completed'");
    expect(query.text).toContain("ss.completed = true");
    expect(query.text).toContain("ss.actual_reps");
    expect(query.text).toContain("ss.actual_weight_kg");
    expect(query.text).toContain("ss.actual_duration_seconds");
    expect(query.text).toContain("ss.actual_distance_meters");
    expect(query.text).toContain("ss.actual_reps > 0");
    expect(query.text).toContain("ss.actual_duration_seconds > 0");
    expect(query.text).toContain("ss.actual_distance_meters > 0");
    expect(query.text).toContain("s.session_date <= ?");
    expect(query.text).not.toContain("s.session_date >=");
    expect(query.text).not.toMatch(/\blimit\b/i);
    expect(query.text).not.toContain("target_reps");
    expect(query.text).not.toContain("target_weight_kg");
    expect(query.values.at(-1)).toBe(PERIOD.to);
  });

  it("parses database numerics and lets earlier history seed visible record flags", async () => {
    database.rows.push(
      row({ session_date: "2026-07-10", actual_reps: "6", actual_weight_kg: "80.25" }),
      row({
        set_id: "set-2",
        session_id: "session-2",
        session_date: "2026-08-10",
        actual_reps: "5",
        actual_weight_kg: "75.50",
      }),
    );

    const result = await loadProject100StrengthDevelopment(TEST_ACTOR, PERIOD);
    const exercise = result.exercises[0];

    expect(exercise.points).toHaveLength(1);
    expect(exercise.muscleGroups).toEqual(["chest", "triceps"]);
    expect(exercise.points[0]).toMatchObject({
      totalReps: 5,
      volumeKg: 377.5,
      isHeaviestSetPr: false,
      isRepsPr: false,
      isTopSetPr: false,
      sessions: [expect.objectContaining({ sessionId: "session-2", title: "Överkropp" })],
    });
    expect(exercise.recordsAsOfTo.heaviestSet).toMatchObject({
      achievedOn: "2026-07-10",
      value: { reps: 6, weightKg: 80.25, volumeKg: 481.5 },
    });
  });

  it("returns reps-only work without manufacturing volume", async () => {
    database.rows.push(row({ actual_reps: "9", actual_weight_kg: null }));

    const result = await loadProject100StrengthDevelopment(TEST_ACTOR, PERIOD);

    expect(result.exercises[0].points[0]).toMatchObject({
      totalReps: 9,
      volumeKg: null,
      heaviestSet: null,
      topSet: null,
    });
  });

  it("retains duration-only work for the muscle coverage", async () => {
    database.rows.push(
      row({
        muscle_groups: ["core"],
        actual_reps: null,
        actual_weight_kg: null,
        actual_duration_seconds: "60",
      }),
    );

    const result = await loadProject100StrengthDevelopment(TEST_ACTOR, PERIOD);

    expect(result.exercises[0]).toMatchObject({
      muscleGroups: ["core"],
      coverage: { visibleCompletedSets: 1, visibleWeightedSets: 0 },
      points: [{ completedSets: 1, totalReps: null, volumeKg: null }],
    });
  });

  it("updates only an owned exercise and audits the count without the selected groups", async () => {
    database.rows.push({ muscle_groups: ["chest", "triceps"] });

    await expect(
      saveProject100ExerciseMuscleGroups(TEST_ACTOR, "exercise-1", [
        "triceps",
        "chest",
        "triceps",
      ]),
    ).resolves.toEqual(["chest", "triceps"]);

    const update = database.calls.find((call) =>
      call.text.includes("update project100_exercises"),
    );
    expect(update?.text).toContain("id = ? and user_id = ?");
    expect(update?.text).not.toContain("archived_at");
    expect(update?.values).toContain("exercise-1");
    expect(update?.values).toContain(TEST_ACTOR.userId);

    const audit = database.calls.find((call) => call.text.includes("family_audit_log"));
    const serializedAudit = JSON.stringify(audit?.values ?? []);
    expect(serializedAudit).toContain("project100.training.exercise.muscles.update");
    expect(serializedAudit).toContain('"groups":2');
    expect(serializedAudit).not.toContain("chest");
    expect(serializedAudit).not.toContain("triceps");
  });

  it("keeps a child away from muscle classification before database access", async () => {
    await expect(
      saveProject100ExerciseMuscleGroups(CHILD, "exercise-1", ["back"]),
    ).rejects.toMatchObject({ code: "PROJECT100_ADULT_ONLY", status: 403 });
    expect(database.sql).not.toHaveBeenCalled();
  });

  it("reports a foreign or missing exercise instead of writing an orphan mapping", async () => {
    await expect(
      saveProject100ExerciseMuscleGroups(TEST_ACTOR, "exercise-elsewhere", ["back"]),
    ).rejects.toMatchObject({ code: "PROJECT100_EXERCISE_NOT_FOUND", status: 404 });
    expect(database.calls.some((call) => call.text.includes("family_audit_log"))).toBe(false);
  });
});

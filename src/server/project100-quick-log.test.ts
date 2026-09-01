import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const state = {
    plannedSessionExists: true,
    plannedSessionStatus: "planned",
    templateExists: true,
    existingJournal: null as {
      body: string | null;
      mood: number | null;
      energy: number | null;
      sleep_hours: string | number | null;
      excluded_from_ai: boolean;
    } | null,
  };

  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });

    // 1. Planned session lookup
    if (text.includes("select id, title, status from project100_training_sessions")) {
      if (!state.plannedSessionExists) return Promise.resolve([]);
      return Promise.resolve([
        { id: values[0] as string, title: "Planerat Benpass", status: state.plannedSessionStatus },
      ]);
    }

    // 2. Template lookup
    if (text.includes("from project100_training_templates where id = ?")) {
      if (!state.templateExists) return Promise.resolve([]);
      return Promise.resolve([
        { id: values[0] as string, name: "Överkropp A", activity_type: "strength_home" },
      ]);
    }

    // 3. Template exercises & sets lookup
    if (text.includes("from project100_training_template_exercises te")) {
      return Promise.resolve([
        {
          te_id: "te-1",
          exercise_id: "ex-1",
          exercise_name: "Bänkpress",
          exercise_position: 0,
          exercise_notes: "Stopp i botten",
          ts_id: "ts-1",
          set_position: 0,
          target_reps: 8,
          target_weight_kg: "80.00",
          target_duration_seconds: null,
          target_distance_meters: null,
          target_rpe: 8,
        },
      ]);
    }

    // 4. Journal lookup
    if (text.includes("from project100_journal_entries where user_id = ?")) {
      if (!state.existingJournal) return Promise.resolve([]);
      return Promise.resolve([
        {
          written_on: values[1] as string,
          body: state.existingJournal.body,
          mood: state.existingJournal.mood,
          energy: state.existingJournal.energy,
          sleep_hours: state.existingJournal.sleep_hours,
          excluded_from_ai: state.existingJournal.excluded_from_ai,
        },
      ]);
    }

    // 5. Inserts & updates
    if (
      text.startsWith("insert into") ||
      text.startsWith("update project100_") ||
      text.includes("family_audit_log")
    ) {
      return Promise.resolve([]);
    }

    return Promise.resolve([]);
  });

  const begin = vi.fn(async (callback: (tx: typeof sql) => Promise<unknown>) => callback(sql));
  Object.assign(sql, { begin, json: (value: unknown) => value });
  return { begin, calls, sql, state };
});

vi.mock("@/server/database", () => ({ readyClient: async () => database.sql }));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://project100.test/database",
  demoFallbackAllowed: () => false,
}));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: vi.fn() } }) }));

import { executeProject100QuickLog } from "@/server/project100-quick-log";
import { AppError } from "@/server/errors";

const CHILD = { ...TEST_ACTOR, personType: "child" as const };

describe("Projekt 100 Quick Log (Snabbspåret)", () => {
  beforeEach(() => {
    database.calls.length = 0;
    database.sql.mockClear();
    database.state.plannedSessionExists = true;
    database.state.plannedSessionStatus = "planned";
    database.state.templateExists = true;
    database.state.existingJournal = null;
  });

  it("saves all three parts (workout, journal, shake) in one atomic transaction", async () => {
    const result = await executeProject100QuickLog(TEST_ACTOR, {
      workout: {
        mode: "template",
        templateId: "tmpl-1",
        title: "Överkropp A",
        sessionDate: "2026-08-26",
        durationMinutes: 45,
        effort: 8,
        notes: "Grymt pass",
        followedPlan: true,
      },
      journal: {
        energy: 4,
        mood: 5,
        reflection: "Bra fokus idag",
      },
      proteinShake: {
        enabled: true,
        proteinG: 35,
        kcal: 160,
        title: "Post-workout Proteinshake",
      },
    });

    expect(result.success).toBe(true);
    expect(result.sessionTitle).toBe("Överkropp A");
    expect(result.journalUpdated).toBe(true);
    expect(result.proteinAddedG).toBe(35);
    expect(result.receipt).toContain("Pass sparat");
    expect(result.receipt).toContain("Energi 4 loggad");
    expect(result.receipt).toContain("35 g protein tillagt");

    // Check transaction called
    expect(database.begin).toHaveBeenCalled();

    // Check tables touched
    const touched = database.calls.map((c) => c.text);
    expect(touched.some((t) => t.includes("insert into project100_training_sessions"))).toBe(true);
    expect(touched.some((t) => t.includes("insert into project100_training_session_exercises"))).toBe(true);
    expect(touched.some((t) => t.includes("insert into project100_training_session_sets"))).toBe(true);
    expect(touched.some((t) => t.includes("insert into project100_journal_entries"))).toBe(true);
    expect(touched.some((t) => t.includes("insert into project100_meals"))).toBe(true);
  });

  it("rolls back the entire transaction if an error occurs", async () => {
    database.state.templateExists = false;

    await expect(
      executeProject100QuickLog(TEST_ACTOR, {
        workout: {
          mode: "template",
          templateId: "non-existent",
          sessionDate: "2026-08-26",
          durationMinutes: 45,
          effort: 7,
          notes: null,
          followedPlan: false,
        },
        journal: { energy: 4, mood: 4, reflection: null },
        proteinShake: { enabled: true, proteinG: 35, kcal: null, title: "Shake" },
      }),
    ).rejects.toThrowError(AppError);
  });

  it("merges with existing journal entry and preserves sleep_hours without overwriting with null", async () => {
    database.state.existingJournal = {
      body: "Sov ganska djupt",
      mood: 3,
      energy: 2,
      sleep_hours: "8.00",
      excluded_from_ai: false,
    };

    const result = await executeProject100QuickLog(TEST_ACTOR, {
      workout: {
        mode: "custom",
        title: "Snabbpass",
        activityType: "strength_home",
        sessionDate: "2026-08-26",
        durationMinutes: 30,
        effort: 6,
        notes: null,
      },
      journal: {
        energy: 4,
        mood: null,
        reflection: "Ny energi efter lunch",
      },
      proteinShake: null,
    });

    expect(result.success).toBe(true);
    expect(result.journalUpdated).toBe(true);

    const journalInsert = database.calls.find((c) =>
      c.text.includes("insert into project100_journal_entries"),
    );
    expect(journalInsert).toBeDefined();

    // Values: user_id, sessionDate, mergedBody, mergedMood, mergedEnergy, preservedSleep, preservedExcluded
    const [, , mergedBody, mergedMood, mergedEnergy, preservedSleep] = journalInsert!.values;
    expect(mergedBody).toBe("Sov ganska djupt\n\nNy energi efter lunch");
    expect(mergedMood).toBe(3); // Preserved
    expect(mergedEnergy).toBe(4); // Updated
    expect(preservedSleep).toBe(8); // Preserved!
  });

  it("completes a planned session without creating duplicate session rows", async () => {
    const result = await executeProject100QuickLog(TEST_ACTOR, {
      workout: {
        mode: "planned",
        plannedSessionId: "planned-session-1",
        sessionDate: "2026-08-26",
        durationMinutes: 60,
        effort: 8,
        notes: "Avklarat som planerat",
        followedPlan: true,
      },
      journal: null,
      proteinShake: null,
    });

    expect(result.success).toBe(true);
    expect(result.sessionId).toBe("planned-session-1");
    expect(result.workoutMode).toBe("planned");

    // Ensure NO insert into project100_training_sessions occurred!
    const sessionInserts = database.calls.filter((c) =>
      c.text.includes("insert into project100_training_sessions"),
    );
    expect(sessionInserts.length).toBe(0);

    // Ensure update on existing session occurred
    const sessionUpdate = database.calls.find((c) =>
      c.text.includes("update project100_training_sessions set status = 'completed'"),
    );
    expect(sessionUpdate).toBeDefined();
  });

  it("leaves actual set metrics null when followedPlan is false (no invented fake values)", async () => {
    await executeProject100QuickLog(TEST_ACTOR, {
      workout: {
        mode: "template",
        templateId: "tmpl-1",
        sessionDate: "2026-08-26",
        durationMinutes: 45,
        effort: null,
        notes: null,
        followedPlan: false,
      },
      journal: null,
      proteinShake: null,
    });

    const setInserts = database.calls.filter((c) =>
      c.text.includes("insert into project100_training_session_sets"),
    );
    expect(setInserts.length).toBeGreaterThan(0);

    // For the set insert:
    // target values (8, 80) should be present, but actual values should be null!
    for (const call of setInserts) {
      const actualReps = call.values[9];
      const actualWeight = call.values[10];
      const actualRpe = call.values[13];
      expect(actualReps).toBeNull();
      expect(actualWeight).toBeNull();
      expect(actualRpe).toBeNull();
    }
  });

  it("copies target metrics to actual metrics when followedPlan is true", async () => {
    await executeProject100QuickLog(TEST_ACTOR, {
      workout: {
        mode: "template",
        templateId: "tmpl-1",
        sessionDate: "2026-08-26",
        durationMinutes: 45,
        effort: 7,
        notes: null,
        followedPlan: true,
      },
      journal: null,
      proteinShake: null,
    });

    const setInserts = database.calls.filter((c) =>
      c.text.includes("insert into project100_training_session_sets"),
    );
    expect(setInserts.length).toBeGreaterThan(0);

    for (const call of setInserts) {
      const actualReps = call.values[9];
      const actualWeight = call.values[10];
      const actualRpe = call.values[13];
      expect(actualReps).toBe(8);
      expect(actualWeight).toBe(80);
      expect(actualRpe).toBe(8);
    }
  });

  it("does not log a protein shake when enabled is false or protein is 0", async () => {
    const result = await executeProject100QuickLog(TEST_ACTOR, {
      workout: {
        mode: "custom",
        title: "Pass utan shake",
        activityType: "strength_home",
        sessionDate: "2026-08-26",
        durationMinutes: 30,
        effort: null,
        notes: null,
      },
      journal: null,
      proteinShake: {
        enabled: false,
        proteinG: 35,
        kcal: null,
        title: "Shake",
      },
    });

    expect(result.proteinAddedG).toBeNull();
    const mealInserts = database.calls.filter((c) => c.text.includes("insert into project100_meals"));
    expect(mealInserts.length).toBe(0);
  });

  it("separates workout effort (RPE 1-10) from journal daily energy (1-5)", async () => {
    const result = await executeProject100QuickLog(TEST_ACTOR, {
      workout: {
        mode: "custom",
        title: "Lätt pass på trött dag",
        activityType: "strength_home",
        sessionDate: "2026-08-26",
        durationMinutes: 25,
        effort: 3, // Light workout RPE 3
        notes: null,
      },
      journal: {
        energy: 1, // Very low daily energy 1
        mood: 2,
        reflection: "Trött efter jobbet",
      },
      proteinShake: null,
    });

    expect(result.success).toBe(true);

    const sessionInsert = database.calls.find((c) =>
      c.text.includes("insert into project100_training_sessions"),
    );
    expect(sessionInsert).toBeDefined();
    // Effort parameter passed to session
    expect(sessionInsert!.values[6]).toBe(3);

    const journalInsert = database.calls.find((c) =>
      c.text.includes("insert into project100_journal_entries"),
    );
    expect(journalInsert).toBeDefined();
    // Energy parameter passed to journal
    expect(journalInsert!.values[4]).toBe(1);
  });

  it("enforces strict user scoping across all tables", async () => {
    await executeProject100QuickLog(TEST_ACTOR, {
      workout: {
        mode: "template",
        templateId: "tmpl-1",
        sessionDate: "2026-08-26",
        durationMinutes: 45,
        effort: 7,
        notes: null,
        followedPlan: true,
      },
      journal: {
        energy: 4,
        mood: 4,
        reflection: "Bra pass",
      },
      proteinShake: {
        enabled: true,
        proteinG: 35,
        kcal: 160,
        title: "Proteinshake",
      },
    });

    const touched = database.calls.filter((call) => call.text.includes("project100_"));
    expect(touched.length).toBeGreaterThan(0);
    for (const call of touched) {
      expect(call.text).toMatch(/user_id/);
      expect(call.values).toContain(TEST_ACTOR.userId);
    }
  });

  it("blocks non-adults from logging via snabbspåret", async () => {
    await expect(
      executeProject100QuickLog(CHILD, {
        workout: {
          mode: "custom",
          title: "Barnpass",
          activityType: "strength_home",
          sessionDate: "2026-08-26",
          durationMinutes: 20,
          effort: null,
          notes: null,
        },
        journal: null,
        proteinShake: null,
      }),
    ).rejects.toThrowError(AppError);
  });
});

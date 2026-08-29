import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const state = {
    sessionId: "",
    templateId: "",
    templateExists: true,
    status: "planned" as string | null,
  };

  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });

    if (text.includes("insert into project100_exercises")) {
      return Promise.resolve([{ id: "exercise-library-1" }]);
    }
    if (text.includes("insert into project100_training_sessions")) {
      state.sessionId = values[0] as string;
      return Promise.resolve([]);
    }
    if (text.includes("insert into project100_training_templates")) {
      state.templateId = values[0] as string;
      return Promise.resolve([]);
    }
    if (text.startsWith("insert into")) return Promise.resolve([]);

    if (text.includes("delete from project100_training_sessions")) {
      return Promise.resolve(values[0] === "session-owned" ? [{ id: "session-owned" }] : []);
    }
    if (text.includes("update project100_training_templates")) {
      return Promise.resolve(values[0] === "template-owned" ? [{ id: "template-owned" }] : []);
    }
    if (text.includes("select status from project100_training_sessions")) {
      return Promise.resolve(state.status === null ? [] : [{ status: state.status }]);
    }
    if (
      text.includes("update project100_training_sessions") ||
      text.includes("update project100_training_session_sets")
    ) {
      return Promise.resolve([]);
    }

    // The template lookup made before a session copies its targets.
    if (text.includes("select id from project100_training_templates where id = ?")) {
      return Promise.resolve(state.templateExists ? [{ id: values[0] }] : []);
    }
    // The duplicate-name guard before a new template is written.
    if (text.includes("lower(btrim(name))")) return Promise.resolve([]);
    if (text.includes("select te.position as exercise_position")) {
      return Promise.resolve([
        {
          exercise_position: 0,
          id: "template-set-1",
          template_exercise_id: "template-exercise-1",
          position: 0,
          target_reps: 12,
          target_weight_kg: "35.00",
          target_duration_seconds: null,
          target_distance_meters: null,
          target_rpe: null,
        },
      ]);
    }

    if (text.includes("to_char(session_date")) {
      return Promise.resolve([
        {
          id: state.sessionId || "session-owned",
          source_template_id: null,
          title: "Helkropp hemma",
          activity_type: "strength_home",
          status: "completed",
          session_date: "2026-08-26",
          planned_start_at: null,
          planned_end_at: null,
          started_at: null,
          ended_at: null,
          duration_seconds: 2_700,
          location: "Hemma",
          effort: 7,
          body_before: null,
          body_after: null,
          notes: null,
          created_at: "2026-08-26T18:00:00.000Z",
        },
      ]);
    }
    if (text.includes("from project100_training_session_exercises se")) return Promise.resolve([]);
    if (text.includes("from project100_training_session_sets ss")) return Promise.resolve([]);
    if (text.includes("select id, name, activity_type, description, created_at")) {
      return Promise.resolve([
        {
          id: state.templateId,
          name: "30 min helkropp",
          activity_type: "strength_home",
          description: null,
          created_at: "2026-08-26T18:00:00.000Z",
        },
      ]);
    }
    if (text.includes("from project100_training_template_exercises te join")) {
      return Promise.resolve([]);
    }
    if (text.includes("from project100_training_template_sets ts")) return Promise.resolve([]);
    if (text.includes("family_audit_log")) return Promise.resolve([]);

    throw new Error(`Unexpected query in test: ${text}`);
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

import {
  archiveProject100TrainingTemplate,
  createProject100TrainingSession,
  createProject100TrainingTemplate,
  deleteProject100TrainingSession,
  loadProject100TrainingView,
  updateProject100TrainingSession,
} from "@/server/project100-training";

const CHILD = { ...TEST_ACTOR, personType: "child" as const };

function completedSession(overrides: Record<string, unknown> = {}) {
  return {
    title: "Helkropp hemma",
    activityType: "strength_home" as const,
    status: "completed" as const,
    sessionDate: "2026-08-26",
    templateId: null,
    plannedStartAt: null,
    plannedEndAt: null,
    durationSeconds: 2_700,
    location: "Hemma",
    effort: 7,
    bodyBefore: null,
    bodyAfter: null,
    notes: null,
    exercises: [
      {
        name: "Marklyft",
        notes: null,
        sets: [
          {
            reps: 8,
            weightKg: 60,
            durationSeconds: null,
            distanceMeters: null,
            rpe: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function queriesTouchingProject100() {
  return database.calls.filter((call) => call.text.includes("project100_"));
}

describe("Projekt 100 training storage", () => {
  beforeEach(() => {
    database.calls.length = 0;
    database.sql.mockClear();
    database.state.templateExists = true;
  });

  it("scopes every training query to the signed-in account", async () => {
    await loadProject100TrainingView(TEST_ACTOR, "2026-08-26");
    const touched = queriesTouchingProject100();

    expect(touched.length).toBeGreaterThan(0);
    for (const call of touched) {
      expect(call.text).toMatch(/user_id = \?/);
      expect(call.values).toContain(TEST_ACTOR.userId);
    }
  });

  it("keeps a child out before any training row is read", async () => {
    await expect(loadProject100TrainingView(CHILD)).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
      status: 403,
    });
    expect(database.sql).not.toHaveBeenCalled();
  });

  it("stamps the owner on the session, its exercises and every set", async () => {
    await createProject100TrainingSession(TEST_ACTOR, completedSession());

    for (const table of [
      "insert into project100_training_sessions",
      "insert into project100_training_session_exercises",
      "insert into project100_training_session_sets",
    ]) {
      const insert = database.calls.find((call) => call.text.includes(table));
      expect(insert, table).toBeDefined();
      expect(insert?.text).toContain("user_id");
      expect(insert?.values).toContain(TEST_ACTOR.userId);
    }
  });

  it("writes a logged set as what happened, not as a target", async () => {
    await createProject100TrainingSession(TEST_ACTOR, completedSession());
    const set = database.calls.find((call) =>
      call.text.includes("insert into project100_training_session_sets"),
    );

    // target_* stays empty for a freehand session; actual_* carries the truth.
    expect(set?.values.slice(4, 9)).toEqual([null, null, null, null, null]);
    expect(set?.values.slice(9, 15)).toEqual([8, 60, null, null, null, true]);
  });

  it("keeps the template target beside the result when a template is used", async () => {
    await createProject100TrainingSession(
      TEST_ACTOR,
      completedSession({ templateId: "template-owned" }),
    );
    const set = database.calls.find((call) =>
      call.text.includes("insert into project100_training_session_sets"),
    );

    expect(set?.values.slice(4, 9)).toEqual([12, 35, null, null, null]);
    expect(set?.values.slice(9, 14)).toEqual([8, 60, null, null, null]);
  });

  it("stores a planned session as a target with nothing logged yet", async () => {
    await createProject100TrainingSession(
      TEST_ACTOR,
      completedSession({ status: "planned", sessionDate: "2099-01-01" }),
    );
    const set = database.calls.find((call) =>
      call.text.includes("insert into project100_training_session_sets"),
    );

    expect(set?.values.slice(4, 9)).toEqual([8, 60, null, null, null]);
    expect(set?.values.slice(9, 15)).toEqual([null, null, null, null, null, false]);
  });

  it("refuses to log a completed session in the future", async () => {
    await expect(
      createProject100TrainingSession(
        TEST_ACTOR,
        completedSession({ sessionDate: "2099-01-01" }),
      ),
    ).rejects.toMatchObject({ code: "PROJECT100_FUTURE_SESSION", status: 400 });
    expect(database.sql).not.toHaveBeenCalled();
  });

  it("refuses a template that does not belong to the account", async () => {
    database.state.templateExists = false;

    await expect(
      createProject100TrainingSession(
        TEST_ACTOR,
        completedSession({ templateId: "template-someone-else" }),
      ),
    ).rejects.toMatchObject({ code: "PROJECT100_TEMPLATE_NOT_FOUND", status: 404 });
    expect(
      database.calls.some((call) => call.text.includes("insert into project100_training_sessions")),
    ).toBe(false);
  });

  it("requires the owner on delete and reports a miss instead of a silent success", async () => {
    await expect(deleteProject100TrainingSession(TEST_ACTOR, "session-owned")).resolves.toBe(true);
    const remove = database.calls.find((call) => call.text.includes("delete from"));
    expect(remove?.text).toContain("user_id = ?");
    expect(remove?.values).toEqual(["session-owned", TEST_ACTOR.userId]);

    database.calls.length = 0;
    await expect(deleteProject100TrainingSession(TEST_ACTOR, "session-elsewhere")).resolves.toBe(
      false,
    );
    expect(database.calls.some((call) => call.text.includes("family_audit_log"))).toBe(false);
  });

  it("archives a template instead of rewriting the sessions built from it", async () => {
    await expect(archiveProject100TrainingTemplate(TEST_ACTOR, "template-owned")).resolves.toBe(
      true,
    );
    const archive = database.calls.find((call) => call.text.includes("update project100_"));

    expect(archive?.text).toContain("set archived_at = now()");
    expect(archive?.text).toContain("user_id = ?");
    expect(archive?.text).not.toContain("delete");
    expect(archive?.values).toEqual(["template-owned", TEST_ACTOR.userId]);
  });

  it("audits the shape of a training change without its content", async () => {
    await createProject100TrainingTemplate(TEST_ACTOR, {
      name: "30 min helkropp",
      activityType: "strength_home",
      description: "Vardagsgrunden",
      exercises: [
        {
          name: "Marklyft",
          notes: "Lugn excentrisk",
          sets: [
            {
              reps: 12,
              weightKg: 35,
              durationSeconds: null,
              distanceMeters: null,
              rpe: null,
            },
          ],
        },
      ],
    });
    const audit = database.calls.find((call) => call.text.includes("family_audit_log"));
    const serialized = JSON.stringify(audit?.values ?? []);

    expect(audit?.values).toContain("project100.training.template.create");
    expect(serialized).not.toContain("30 min helkropp");
    expect(serialized).not.toContain("Marklyft");
    expect(serialized).not.toContain("Vardagsgrunden");
  });

  it("keeps a child out of every training mutation", async () => {
    await expect(
      createProject100TrainingSession(CHILD, completedSession()),
    ).rejects.toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    await expect(deleteProject100TrainingSession(CHILD, "session-owned")).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });
    await expect(archiveProject100TrainingTemplate(CHILD, "template-owned")).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });
    expect(database.sql).not.toHaveBeenCalled();
  });
});

describe("Carrying out a planned session", () => {
  beforeEach(() => {
    database.calls.length = 0;
    database.sql.mockClear();
    database.state.status = "planned";
    database.state.sessionId = "";
  });

  function completion(overrides: Record<string, unknown> = {}) {
    return {
      action: "complete" as const,
      sessionDate: "2026-08-26",
      durationSeconds: 2_400,
      location: "Hemma",
      effort: 8,
      bodyBefore: null,
      bodyAfter: null,
      notes: null,
      sets: [
        {
          id: "set-1",
          reps: 8,
          weightKg: 60,
          durationSeconds: null,
          distanceMeters: null,
          rpe: null,
          completed: true,
        },
      ],
      ...overrides,
    };
  }

  it("writes the result into the actual columns and leaves the plan alone", async () => {
    await updateProject100TrainingSession(TEST_ACTOR, "session-owned", completion());
    const setUpdate = database.calls.find((call) =>
      call.text.includes("update project100_training_session_sets"),
    );

    expect(setUpdate?.text).toContain("actual_reps = ?");
    expect(setUpdate?.text).not.toContain("target_reps =");
    expect(setUpdate?.values.slice(0, 6)).toEqual([8, 60, null, null, null, true]);
  });

  it("refuses a set id that belongs to a different session", async () => {
    await updateProject100TrainingSession(TEST_ACTOR, "session-owned", completion());
    const setUpdate = database.calls.find((call) =>
      call.text.includes("update project100_training_session_sets"),
    );

    // Ownership is not enough; the row must also sit in the session being closed.
    expect(setUpdate?.text).toContain("user_id = ?");
    expect(setUpdate?.text).toContain("session_exercise_id in ( select id from");
    expect(setUpdate?.values).toContain("session-owned");
  });

  it("moves a plan without claiming anything was done", async () => {
    await updateProject100TrainingSession(TEST_ACTOR, "session-owned", {
      action: "move",
      sessionDate: "2026-08-28",
      plannedStartAt: null,
      plannedEndAt: null,
    });
    const update = database.calls.find((call) =>
      call.text.includes("update project100_training_sessions"),
    );

    expect(update?.text).toContain("set session_date = ?");
    expect(update?.text).not.toContain("status =");
    expect(update?.values.slice(0, 3)).toEqual(["2026-08-28", null, null]);
  });

  it("records a skipped session as a gap, not as a completed one", async () => {
    await updateProject100TrainingSession(TEST_ACTOR, "session-owned", {
      action: "skip",
      notes: "Nattpass, ingen ork kvar",
    });
    const update = database.calls.find((call) =>
      call.text.includes("update project100_training_sessions"),
    );

    expect(update?.text).toContain("set status = 'skipped'");
    expect(update?.text).toContain("started_at = null");
  });

  it("refuses to rewrite a session that is already history", async () => {
    database.state.status = "completed";

    await expect(
      updateProject100TrainingSession(TEST_ACTOR, "session-owned", completion()),
    ).rejects.toMatchObject({ code: "PROJECT100_SESSION_NOT_PLANNED", status: 409 });
    expect(
      database.calls.some((call) => call.text.includes("update project100_training_sessions")),
    ).toBe(false);
  });

  it("refuses to complete a session that has not happened yet", async () => {
    await expect(
      updateProject100TrainingSession(
        TEST_ACTOR,
        "session-owned",
        completion({ sessionDate: "2099-01-01" }),
      ),
    ).rejects.toMatchObject({ code: "PROJECT100_FUTURE_SESSION", status: 400 });
    expect(database.sql).not.toHaveBeenCalled();
  });

  it("reports a missing session instead of writing into someone else's", async () => {
    database.state.status = null;

    await expect(
      updateProject100TrainingSession(TEST_ACTOR, "session-elsewhere", completion()),
    ).rejects.toMatchObject({ code: "PROJECT100_SESSION_NOT_FOUND", status: 404 });
    const lookup = database.calls.find((call) => call.text.includes("select status from"));
    expect(lookup?.values).toEqual(["session-elsewhere", TEST_ACTOR.userId]);
  });

  it("keeps a child out of a planned session as well", async () => {
    await expect(
      updateProject100TrainingSession(CHILD, "session-owned", completion()),
    ).rejects.toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    expect(database.sql).not.toHaveBeenCalled();
  });
});

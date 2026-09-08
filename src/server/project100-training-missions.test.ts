import { beforeEach, describe, expect, it, vi } from "vitest";

import { calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const state = {
    missionId: "mission-1",
    blockId: "block-1",
    blockInsertDuplicate: false,
    existingBlockSessionId: "mission-1",
    includeBlock: false,
    missionStatus: "in_progress",
    liveGateMode: false,
  };
  let exerciseCounter = 0;

  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });

    if (state.liveGateMode && text.includes("select id, mission_type, status") && text.includes("order by session_date desc")) {
      return Promise.resolve([{
        id: "00000000-0000-4000-8000-000000000001",
        mission_type: "upper",
        status: "completed",
        session_date: "2026-09-08",
      }]);
    }
    if (state.liveGateMode && text.includes("select id, session_id, environment, source")) {
      return Promise.resolve([
        { id: "b1", session_id: "00000000-0000-4000-8000-000000000001", environment: "home", source: "manual" },
        { id: "b2", session_id: "00000000-0000-4000-8000-000000000001", environment: "outdoor_gym", source: "motion" },
        { id: "b3", session_id: "00000000-0000-4000-8000-000000000001", environment: "home", source: "jarvis" },
      ]);
    }
    if (state.liveGateMode && text.includes("select se.session_id, e.movement_pattern, e.purpose")) {
      return Promise.resolve([
        { session_id: "00000000-0000-4000-8000-000000000001", movement_pattern: "horizontal_push", purpose: "strength_hypertrophy", completed_sets: 3 },
        { session_id: "00000000-0000-4000-8000-000000000001", movement_pattern: "horizontal_pull", purpose: "strength_hypertrophy", completed_sets: 3 },
        { session_id: "00000000-0000-4000-8000-000000000001", movement_pattern: "vertical_push", purpose: "strength_hypertrophy", completed_sets: 3 },
        { session_id: "00000000-0000-4000-8000-000000000001", movement_pattern: "vertical_pull", purpose: "strength_hypertrophy", completed_sets: 3 },
      ]);
    }
    if (text.includes("where user_id = ? and status = 'in_progress'")) return Promise.resolve([]);
    if (
      text.includes("where user_id = ? and session_date = ?") &&
      text.includes("and mission_type is not null")
    ) return Promise.resolve([]);
    if (text.includes("select count(*)::integer as count")) return Promise.resolve([{ count: 0 }]);
    if (text.includes("insert into project100_exercises")) {
      exerciseCounter += 1;
      return Promise.resolve([{ id: `exercise-${exerciseCounter}` }]);
    }
    if (text.includes("insert into project100_training_blocks")) {
      if (state.blockInsertDuplicate) return Promise.resolve([]);
      state.blockId = values[0] as string;
      state.includeBlock = true;
      return Promise.resolve([{ id: state.blockId }]);
    }
    if (text.includes("from project100_training_blocks") && text.includes("source_event_id = ?")) {
      return Promise.resolve([{ id: "block-existing", session_id: state.existingBlockSessionId }]);
    }
    if (text.includes("select to_char(session_date") && text.includes("mission_type is not null")) {
      return Promise.resolve([{ session_date: calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE), status: "in_progress" }]);
    }
    if (text.includes("from project100_training_session_exercises") && text.includes("exercise_id = ?")) {
      return Promise.resolve([{ id: "session-exercise-1" }]);
    }
    if (text.includes("select coalesce(max(position)")) return Promise.resolve([{ next_position: 3 }]);
    if (text.includes("count(*)::integer as completed_sets")) {
      return Promise.resolve([{ movement_pattern: "horizontal_push", completed_sets: 3 }]);
    }
    if (
      text.startsWith("update project100_training_sessions") &&
      text.includes("mission_type is not null") &&
      text.includes("returning id")
    ) {
      if (state.missionStatus !== "in_progress") return Promise.resolve([]);
      state.missionStatus = "completed";
      return Promise.resolve([{ id: state.missionId }]);
    }
    if (text.startsWith("insert into") || text.startsWith("update ")) return Promise.resolve([]);
    if (text.includes("family_audit_log")) return Promise.resolve([]);

    if (text.includes("from project100_training_sessions") && text.includes("where id = ?")) {
      return Promise.resolve([
        {
          id: state.missionId,
          title: "Överkropp",
          mission_type: "upper",
          status: state.missionStatus,
          session_date: calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE),
          started_at: "2026-08-26T08:00:00.000Z",
          ended_at: null,
          duration_seconds: state.includeBlock ? 300 : 0,
          effort: null,
          body_after: null,
          notes: null,
        },
      ]);
    }
    if (text.includes("from project100_training_blocks")) {
      return Promise.resolve(
        state.includeBlock
          ? [
              {
                id: state.blockId,
                started_at: "2026-08-26T08:00:00.000Z",
                ended_at: "2026-08-26T08:05:00.000Z",
                active_seconds: 300,
                environment: "grass",
                location: null,
                source: "motion",
                source_event_id: "motion-event-1",
                setup_profile_id: null,
              },
            ]
          : [],
      );
    }
    if (text.includes("from project100_training_session_sets ss")) {
      return Promise.resolve(
        state.includeBlock
          ? [
              {
                id: "set-actual-1",
                block_id: state.blockId,
                name: "Armhävningar",
                movement_pattern: "horizontal_push",
                purpose: "strength_hypertrophy",
                actual_reps: 20,
                actual_weight_kg: 0,
                actual_duration_seconds: null,
                actual_distance_meters: null,
                actual_rpe: 8,
                completed: true,
                performed_at: "2026-08-26T08:04:00.000Z",
                source: "motion",
                source_event_id: "motion-set-1",
                observation_level: "rep_counting",
                rom_confidence: 0.78,
              },
            ]
          : [],
      );
    }

    throw new Error(`Unexpected query in test: ${text}`);
  });
  const begin = vi.fn(async (callback: (tx: typeof sql) => Promise<unknown>) => callback(sql));
  Object.assign(sql, {
    begin,
    json: (value: unknown) => value,
    array: (value: unknown) => value,
  });
  return { calls, sql, state, resetExerciseCounter: () => { exerciseCounter = 0; } };
});

vi.mock("@/server/database", () => ({ readyClient: async () => database.sql }));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://project100.test/database",
  demoFallbackAllowed: () => false,
}));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: vi.fn() } }) }));

import {
  appendProject100TrainingBlock,
  finishProject100DailyTrainingMission,
  loadProject100TrainingLiveGate,
  startOrResumeProject100DailyTrainingMission,
} from "@/server/project100-training-missions";

function blockInput() {
  const today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  return {
    startedAt: `${today}T08:00:00.000Z`,
    endedAt: `${today}T08:05:00.000Z`,
    activeSeconds: 300,
    environment: "grass" as const,
    location: null,
    source: "motion" as const,
    sourceEventId: "motion-event-1",
    setupProfileId: null,
    exercises: [
      {
        name: "Armhävningar",
        movementPattern: "horizontal_push" as const,
        purpose: "strength_hypertrophy" as const,
        notes: null,
        sets: [
          {
            reps: 20,
            weightKg: 0,
            durationSeconds: null,
            distanceMeters: null,
            rpe: 8,
            performedAt: `${today}T08:04:00.000Z`,
            sourceEventId: "motion-set-1",
            observationLevel: "rep_counting" as const,
            romConfidence: 0.78,
          },
        ],
      },
    ],
  };
}

describe("Projekt 100 daily training missions", () => {
  beforeEach(() => {
    database.calls.length = 0;
    database.sql.mockClear();
    database.state.missionId = "mission-1";
    database.state.blockId = "block-1";
    database.state.blockInsertDuplicate = false;
    database.state.existingBlockSessionId = "mission-1";
    database.state.includeBlock = false;
    database.state.missionStatus = "in_progress";
    database.state.liveGateMode = false;
    database.resetExerciseCounter();
  });

  it("starts one movement-based mission with four slots and twelve target sets", async () => {
    const today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
    const mission = await startOrResumeProject100DailyTrainingMission(TEST_ACTOR, {
      missionType: "upper",
      sessionDate: today,
    });

    expect(mission.missionType).toBe("upper");
    expect(
      database.calls.filter((call) =>
        call.text.includes("insert into project100_training_session_exercises"),
      ),
    ).toHaveLength(4);
    expect(
      database.calls.filter((call) =>
        call.text.includes("insert into project100_training_session_sets"),
      ),
    ).toHaveLength(12);
    expect(JSON.stringify(database.calls)).not.toContain("Dips");
  });

  it("appends a traceable block and derives coverage from completed sets", async () => {
    const result = await appendProject100TrainingBlock(TEST_ACTOR, "mission-1", blockInput());

    expect(result.duplicate).toBe(false);
    expect(result.mission.blocks).toHaveLength(1);
    expect(result.mission.blocks[0]).toMatchObject({
      environment: "grass",
      source: "motion",
      activeSeconds: 300,
    });
    expect(result.mission.coverage).toMatchObject({
      percentage: 8,
      completedTargetSets: 1,
      targetSets: 12,
    });
    expect(result.mission.stimulus.areas[0]).toMatchObject({
      level: "light",
      evidence: { relevantSets: 1, priorWeeklySets: 3, averageRpe: 8 },
    });
    const setInsert = database.calls.find((call) =>
      call.text.includes("insert into project100_training_session_sets") &&
      call.text.includes("block_id"),
    );
    expect(setInsert?.text).toContain("performed_at");
    expect(setInsert?.text).toContain("observation_level");
    expect(setInsert?.text).toContain("rom_confidence");
    const weeklyVolumeQuery = database.calls.find((call) =>
      call.text.includes("count(*)::integer as completed_sets"),
    );
    expect(weeklyVolumeQuery?.text).toContain("s.id <> ?");
    expect(weeklyVolumeQuery?.text).not.toContain("ss.block_id is not null");
  });

  it("treats a replayed source event as success without inserting its sets again", async () => {
    database.state.blockInsertDuplicate = true;
    database.state.includeBlock = true;

    const result = await appendProject100TrainingBlock(TEST_ACTOR, "mission-1", blockInput());

    expect(result.duplicate).toBe(true);
    expect(
      database.calls.some((call) =>
        call.text.includes("insert into project100_training_session_sets") &&
        call.text.includes("block_id"),
      ),
    ).toBe(false);
  });

  it("rejects a replay key already attached to another mission", async () => {
    database.state.blockInsertDuplicate = true;
    database.state.existingBlockSessionId = "mission-other";

    await expect(
      appendProject100TrainingBlock(TEST_ACTOR, "mission-1", blockInput()),
    ).rejects.toMatchObject({ code: "PROJECT100_SOURCE_EVENT_CONFLICT", status: 409 });
  });

  it("finishes a partial day without inventing missing sets", async () => {
    await appendProject100TrainingBlock(TEST_ACTOR, "mission-1", blockInput());
    const mission = await finishProject100DailyTrainingMission(TEST_ACTOR, "mission-1", {
      effort: 8,
      bodyAfter: null,
      notes: "Klar för idag",
    });

    expect(mission.status).toBe("completed");
    expect(mission.coverage.percentage).toBe(8);
    expect(mission.coverage.requirements.some((item) => item.remainingSets > 0)).toBe(true);
    const finish = database.calls.find(
      (call) => call.text.includes("set status = 'completed'") && call.text.includes("returning id"),
    );
    expect(finish?.text).toContain("sum(active_seconds)");
    expect(finish?.text).not.toContain("actual_reps = target_reps");
  });

  it("keeps children out before touching mission storage", async () => {
    await expect(
      appendProject100TrainingBlock(
        { ...TEST_ACTOR, personType: "child" },
        "mission-1",
        blockInput(),
      ),
    ).rejects.toMatchObject({ code: "PROJECT100_ADULT_ONLY", status: 403 });
    expect(database.sql).not.toHaveBeenCalled();
  });

  it("derives K8 from user-scoped persisted missions, blocks and completed sets", async () => {
    database.state.liveGateMode = true;

    const gate = await loadProject100TrainingLiveGate(TEST_ACTOR);

    expect(gate.missions.upper).toMatchObject({
      passed: true,
      coveragePercentage: 100,
      blockCount: 3,
      environments: ["home", "outdoor_gym"],
    });
    expect(gate.passed).toBe(false);
    const gateQueries = database.calls.filter((call) =>
      call.text.includes("order by session_date desc") ||
      call.text.includes("select id, session_id, environment, source") ||
      call.text.includes("select se.session_id, e.movement_pattern, e.purpose"),
    );
    expect(gateQueries).toHaveLength(3);
    expect(gateQueries.every((call) => call.text.includes("user_id = ?"))).toBe(true);
  });
});

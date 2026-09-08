import "server-only";

import type postgres from "postgres";

import { calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import {
  calculateProject100MissionCoverage,
  PROJECT100_DAILY_MISSION_TEMPLATES,
  type Project100ExercisePurpose,
  type Project100MissionCoverage,
  type Project100MissionType,
  type Project100MovementPattern,
  type Project100ObservationLevel,
  type Project100TrainingEnvironment,
  type Project100TrainingSource,
} from "@/lib/project100-training-mission";
import {
  assessProject100TrainingStimulus,
  type Project100TrainingStimulusAssessment,
} from "@/lib/project100-training-stimulus";
import { recordAudit } from "@/server/audit";
import type { ActorContext } from "@/server/authorization-types";
import { readyClient } from "@/server/database";
import { AppError } from "@/server/errors";
import { assertProject100Adult } from "@/server/project100";
import type {
  Project100DailyMissionFinishInput,
  Project100DailyMissionStartInput,
  Project100TrainingBlockAppendInput,
} from "@/server/project100-training-schemas";

type TransactionClient = postgres.TransactionSql;

interface MissionRow {
  id: string;
  title: string;
  mission_type: Project100MissionType;
  status: "planned" | "in_progress" | "completed" | "skipped";
  session_date: string;
  started_at: Date | string | null;
  ended_at: Date | string | null;
  duration_seconds: number | string | null;
  effort: number | null;
  body_after: string | null;
  notes: string | null;
}

interface BlockRow {
  id: string;
  started_at: Date | string;
  ended_at: Date | string;
  active_seconds: number | string;
  environment: Project100TrainingEnvironment;
  location: string | null;
  source: Project100TrainingSource;
  source_event_id: string | null;
  setup_profile_id: string | null;
}

interface MissionSetRow {
  id: string;
  block_id: string | null;
  name: string;
  movement_pattern: Project100MovementPattern | null;
  purpose: Project100ExercisePurpose | null;
  actual_reps: number | string | null;
  actual_weight_kg: number | string | null;
  actual_duration_seconds: number | string | null;
  actual_distance_meters: number | string | null;
  actual_rpe: number | string | null;
  completed: boolean;
  performed_at: Date | string | null;
  source: Project100TrainingSource | null;
  source_event_id: string | null;
  observation_level: Project100ObservationLevel | null;
  rom_confidence: number | string | null;
}

interface WeeklyPatternVolumeRow {
  movement_pattern: Project100MovementPattern;
  completed_sets: number | string;
}

export interface Project100TrainingMissionSet {
  id: string;
  exerciseName: string;
  movementPattern: Project100MovementPattern | null;
  purpose: Project100ExercisePurpose | null;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  rpe: number | null;
  performedAt: string | null;
  source: Project100TrainingSource | null;
  sourceEventId: string | null;
  observationLevel: Project100ObservationLevel | null;
  romConfidence: number | null;
}

export interface Project100TrainingMissionBlock {
  id: string;
  startedAt: string;
  endedAt: string;
  activeSeconds: number;
  environment: Project100TrainingEnvironment;
  location: string | null;
  source: Project100TrainingSource;
  sourceEventId: string | null;
  setupProfileId: string | null;
  sets: Project100TrainingMissionSet[];
}

export interface Project100DailyTrainingMission {
  id: string;
  title: string;
  missionType: Project100MissionType;
  status: MissionRow["status"];
  sessionDate: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  effort: number | null;
  bodyAfter: string | null;
  notes: string | null;
  coverage: Project100MissionCoverage;
  stimulus: Project100TrainingStimulusAssessment;
  dataGaps: string[];
  blocks: Project100TrainingMissionBlock[];
}

export interface Project100AppendTrainingBlockResult {
  duplicate: boolean;
  mission: Project100DailyTrainingMission;
}

function toDateText(value: string): string {
  return value.slice(0, 10);
}

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeExerciseName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("sv-SE");
}

async function upsertExercise(
  sql: TransactionClient,
  userId: string,
  name: string,
  movementPattern: Project100MovementPattern,
  purpose: Project100ExercisePurpose,
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    insert into project100_exercises
      (id, user_id, name, normalized_name, movement_pattern, purpose)
    values
      (${crypto.randomUUID()}, ${userId}, ${name}, ${normalizeExerciseName(name)},
       ${movementPattern}, ${purpose})
    on conflict (user_id, normalized_name) do update
      set name = excluded.name,
          movement_pattern = coalesce(project100_exercises.movement_pattern, excluded.movement_pattern),
          purpose = coalesce(project100_exercises.purpose, excluded.purpose),
          archived_at = null,
          updated_at = now()
    returning id
  `;
  return rows[0].id;
}

async function seedMissionTargets(
  tx: TransactionClient,
  userId: string,
  sessionId: string,
  missionType: Project100MissionType,
): Promise<void> {
  const existing = await tx<{ count: number | string }[]>`
    select count(*)::integer as count
    from project100_training_session_exercises
    where session_id = ${sessionId} and user_id = ${userId}
  `;
  if (Number(existing[0]?.count ?? 0) > 0) return;

  const template = PROJECT100_DAILY_MISSION_TEMPLATES[missionType];
  for (const [exercisePosition, requirement] of template.requirements.entries()) {
    const canonical = requirement.alternatives[0];
    const libraryExerciseId = await upsertExercise(
      tx,
      userId,
      canonical.name,
      requirement.movementPattern,
      "strength_hypertrophy",
    );
    const sessionExerciseId = crypto.randomUUID();
    await tx`
      insert into project100_training_session_exercises
        (id, user_id, session_id, exercise_id, position, notes)
      values
        (${sessionExerciseId}, ${userId}, ${sessionId}, ${libraryExerciseId},
         ${exercisePosition}, ${requirement.label})
    `;
    for (let setPosition = 0; setPosition < requirement.targetSets; setPosition += 1) {
      await tx`
        insert into project100_training_session_sets
          (id, user_id, session_exercise_id, position, target_reps, target_rpe, completed)
        values
          (${crypto.randomUUID()}, ${userId}, ${sessionExerciseId}, ${setPosition},
           ${requirement.targetReps}, 8, false)
      `;
    }
  }
}

async function loadMission(
  actor: ActorContext,
  selector: { id: string } | { sessionDate: string },
): Promise<Project100DailyTrainingMission | null> {
  const sql = await readyClient();
  const rows = "id" in selector
    ? await sql<MissionRow[]>`
        select id, title, mission_type, status,
               to_char(session_date, 'YYYY-MM-DD') as session_date,
               started_at, ended_at, duration_seconds, effort, body_after, notes
        from project100_training_sessions
        where id = ${selector.id} and user_id = ${actor.userId}
          and mission_type is not null
        limit 1
      `
    : await sql<MissionRow[]>`
        select id, title, mission_type, status,
               to_char(session_date, 'YYYY-MM-DD') as session_date,
               started_at, ended_at, duration_seconds, effort, body_after, notes
        from project100_training_sessions
        where user_id = ${actor.userId} and session_date = ${selector.sessionDate}
          and mission_type is not null
        order by case status
          when 'in_progress' then 0 when 'planned' then 1 when 'completed' then 2 else 3 end,
          created_at desc, id desc
        limit 1
      `;
  const mission = rows[0];
  if (!mission) return null;

  const [blockRows, setRows, weeklyPatternRows] = await Promise.all([
    sql<BlockRow[]>`
      select id, started_at, ended_at, active_seconds, environment, location,
             source, source_event_id, setup_profile_id
      from project100_training_blocks
      where session_id = ${mission.id} and user_id = ${actor.userId}
      order by started_at, id
    `,
    sql<MissionSetRow[]>`
      select ss.id, ss.block_id, e.name, e.movement_pattern, e.purpose,
             ss.actual_reps, ss.actual_weight_kg, ss.actual_duration_seconds,
             ss.actual_distance_meters, ss.actual_rpe, ss.completed,
             ss.performed_at, ss.source, ss.source_event_id, ss.observation_level,
             ss.rom_confidence
      from project100_training_session_sets ss
      join project100_training_session_exercises se
        on se.id = ss.session_exercise_id and se.user_id = ss.user_id
      join project100_exercises e
        on e.id = se.exercise_id and e.user_id = se.user_id
      where se.session_id = ${mission.id} and ss.user_id = ${actor.userId}
      order by ss.performed_at nulls last, ss.position, ss.id
    `,
    sql<WeeklyPatternVolumeRow[]>`
      select e.movement_pattern, count(*)::integer as completed_sets
      from project100_training_session_sets ss
      join project100_training_session_exercises se
        on se.id = ss.session_exercise_id and se.user_id = ss.user_id
      join project100_training_sessions s
        on s.id = se.session_id and s.user_id = se.user_id
      join project100_exercises e
        on e.id = se.exercise_id and e.user_id = se.user_id
      where ss.user_id = ${actor.userId}
        and ss.completed = true
        and e.purpose = 'strength_hypertrophy'
        and e.movement_pattern is not null
        and s.id <> ${mission.id}
        and s.session_date >= date_trunc('week', ${mission.session_date}::date)::date
        and s.session_date <= ${mission.session_date}::date
      group by e.movement_pattern
    `,
  ]);

  const completedByExercise = new Map<
    string,
    { movementPattern: Project100MovementPattern | null; purpose: Project100ExercisePurpose | null; completedSets: number }
  >();
  for (const row of setRows) {
    const key = `${row.name}\u0000${row.movement_pattern ?? ""}\u0000${row.purpose ?? ""}`;
    const summary = completedByExercise.get(key) ?? {
      movementPattern: row.movement_pattern,
      purpose: row.purpose,
      completedSets: 0,
    };
    if (row.completed && row.block_id !== null) summary.completedSets += 1;
    completedByExercise.set(key, summary);
  }

  const setsByBlock = new Map<string, Project100TrainingMissionSet[]>();
  for (const row of setRows) {
    if (row.block_id === null || !row.completed) continue;
    const list = setsByBlock.get(row.block_id) ?? [];
    list.push({
      id: row.id,
      exerciseName: row.name,
      movementPattern: row.movement_pattern,
      purpose: row.purpose,
      reps: toNumber(row.actual_reps),
      weightKg: toNumber(row.actual_weight_kg),
      durationSeconds: toNumber(row.actual_duration_seconds),
      distanceMeters: toNumber(row.actual_distance_meters),
      rpe: toNumber(row.actual_rpe),
      performedAt: toIso(row.performed_at),
      source: row.source,
      sourceEventId: row.source_event_id,
      observationLevel: row.observation_level,
      romConfidence: toNumber(row.rom_confidence),
    });
    setsByBlock.set(row.block_id, list);
  }

  const blocks = blockRows.map((row) => ({
    id: row.id,
    startedAt: toIso(row.started_at) as string,
    endedAt: toIso(row.ended_at) as string,
    activeSeconds: toNumber(row.active_seconds) ?? 0,
    environment: row.environment,
    location: row.location,
    source: row.source,
    sourceEventId: row.source_event_id,
    setupProfileId: row.setup_profile_id,
    sets: setsByBlock.get(row.id) ?? [],
  }));
  const performedSets = blocks.flatMap((block) => block.sets);
  const priorWeeklySets = Object.fromEntries(weeklyPatternRows.map((row) => [
    row.movement_pattern,
    toNumber(row.completed_sets) ?? 0,
  ])) as Partial<Record<Project100MovementPattern, number>>;
  const stimulus = assessProject100TrainingStimulus({
    missionType: mission.mission_type,
    sets: performedSets,
    priorWeeklySets,
  });
  const dataGaps: string[] = [];
  if (performedSets.some((set) => set.rpe === null)) dataGaps.push("rpe_missing");
  if (performedSets.some((set) =>
    set.purpose === "strength_hypertrophy" &&
    set.romConfidence === null &&
    set.observationLevel !== "full_coaching")) {
    dataGaps.push("rom_confidence_missing");
  }
  if (performedSets.some((set) => set.movementPattern === null)) {
    dataGaps.push("movement_pattern_missing");
  }

  return {
    id: mission.id,
    title: mission.title,
    missionType: mission.mission_type,
    status: mission.status,
    sessionDate: toDateText(mission.session_date),
    startedAt: toIso(mission.started_at),
    endedAt: toIso(mission.ended_at),
    durationSeconds:
      blockRows.reduce((sum, block) => sum + (toNumber(block.active_seconds) ?? 0), 0),
    effort: mission.effort,
    bodyAfter: mission.body_after,
    notes: mission.notes,
    coverage: calculateProject100MissionCoverage(
      mission.mission_type,
      [...completedByExercise.values()],
    ),
    stimulus,
    dataGaps,
    blocks,
  };
}

export async function loadProject100DailyTrainingMission(
  actor: ActorContext,
  sessionDate = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE),
): Promise<Project100DailyTrainingMission | null> {
  assertProject100Adult(actor);
  return loadMission(actor, { sessionDate });
}

export async function startOrResumeProject100DailyTrainingMission(
  actor: ActorContext,
  input: Project100DailyMissionStartInput,
): Promise<Project100DailyTrainingMission> {
  assertProject100Adult(actor);
  const today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  if (input.sessionDate !== today) {
    throw new AppError(400, "PROJECT100_MISSION_NOT_TODAY", "Ett dagsuppdrag kan bara öppnas för idag.");
  }

  const sql = await readyClient();
  let missionId = "";
  await sql.begin(async (tx) => {
    const active = await tx<MissionRow[]>`
      select id, title, mission_type, status,
             to_char(session_date, 'YYYY-MM-DD') as session_date,
             started_at, ended_at, duration_seconds, effort, body_after, notes
      from project100_training_sessions
      where user_id = ${actor.userId} and status = 'in_progress'
      limit 1
      for update
    `;
    if (active[0]) {
      if (
        toDateText(active[0].session_date) !== input.sessionDate ||
        active[0].mission_type !== input.missionType
      ) {
        throw new AppError(
          409,
          "PROJECT100_ACTIVE_MISSION_EXISTS",
          "Avsluta dagens öppna träningsuppdrag innan du startar ett annat.",
        );
      }
      missionId = active[0].id;
      await seedMissionTargets(tx, actor.userId, missionId, input.missionType);
      await recordAudit(tx, actor, {
        action: "project100.training.mission.start",
        targetType: "project100_training_session",
        targetId: missionId,
        metadata: { missionType: input.missionType, resumedPlan: true },
      });
      return;
    }

    const planned = await tx<{ id: string; mission_type: Project100MissionType; status: string }[]>`
      select id, mission_type, status
      from project100_training_sessions
      where user_id = ${actor.userId} and session_date = ${input.sessionDate}
        and mission_type is not null
      order by created_at, id
      limit 1
      for update
    `;
    if (planned[0]?.status !== undefined && planned[0].status !== "planned") {
      throw new AppError(
        409,
        "PROJECT100_DAILY_MISSION_EXISTS",
        "Dagens träningsuppdrag är redan avslutat.",
      );
    }
    if (planned[0] && planned[0].mission_type !== input.missionType) {
      throw new AppError(
        409,
        "PROJECT100_DAILY_MISSION_EXISTS",
        "Det finns redan ett annat planerat träningsuppdrag idag.",
      );
    }
    missionId = planned[0]?.id ?? crypto.randomUUID();
    if (planned[0]) {
      await tx`
        update project100_training_sessions
        set status = 'in_progress', started_at = clock_timestamp(), updated_at = now()
        where id = ${missionId} and user_id = ${actor.userId}
      `;
    } else {
      const template = PROJECT100_DAILY_MISSION_TEMPLATES[input.missionType];
      await tx`
        insert into project100_training_sessions
          (id, user_id, source_template_id, title, activity_type, status,
           session_date, started_at, mission_type)
        values
          (${missionId}, ${actor.userId}, null, ${template.title}, 'strength_home',
           'in_progress', ${input.sessionDate}, clock_timestamp(), ${input.missionType})
      `;
    }
    await seedMissionTargets(tx, actor.userId, missionId, input.missionType);
    await recordAudit(tx, actor, {
      action: "project100.training.mission.start",
      targetType: "project100_training_session",
      targetId: missionId,
      metadata: { missionType: input.missionType, resumedPlan: Boolean(planned[0]) },
    });
  });

  const mission = await loadMission(actor, { id: missionId });
  if (!mission) {
    throw new AppError(500, "PROJECT100_MISSION_NOT_READABLE", "Träningsuppdraget kunde inte läsas tillbaka.");
  }
  return mission;
}

export async function appendProject100TrainingBlock(
  actor: ActorContext,
  sessionId: string,
  input: Project100TrainingBlockAppendInput,
): Promise<Project100AppendTrainingBlockResult> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  let duplicate = false;

  await sql.begin(async (tx) => {
    const current = await tx<{ session_date: string; status: string }[]>`
      select to_char(session_date, 'YYYY-MM-DD') as session_date, status
      from project100_training_sessions
      where id = ${sessionId} and user_id = ${actor.userId} and mission_type is not null
      limit 1
      for update
    `;
    if (!current[0]) {
      throw new AppError(404, "PROJECT100_MISSION_NOT_FOUND", "Träningsuppdraget finns inte.");
    }
    if (current[0].status !== "in_progress") {
      throw new AppError(409, "PROJECT100_MISSION_NOT_OPEN", "Bara ett öppet träningsuppdrag kan fyllas på.");
    }
    const expectedDate = toDateText(current[0].session_date);
    if (
      calendarDateInTimeZone(new Date(input.startedAt), DEFAULT_TIME_ZONE) !== expectedDate ||
      calendarDateInTimeZone(new Date(input.endedAt), DEFAULT_TIME_ZONE) !== expectedDate
    ) {
      throw new AppError(
        400,
        "PROJECT100_BLOCK_OUTSIDE_MISSION_DAY",
        "Träningsblocket måste tillhöra samma dag som träningsuppdraget.",
      );
    }
    for (const exercise of input.exercises) {
      for (const set of exercise.sets) {
        if (calendarDateInTimeZone(new Date(set.performedAt), DEFAULT_TIME_ZONE) !== expectedDate) {
          throw new AppError(
            400,
            "PROJECT100_SET_OUTSIDE_MISSION_DAY",
            "Ett set måste tillhöra samma dag som träningsuppdraget.",
          );
        }
      }
    }

    const blockId = crypto.randomUUID();
    const calculatedActiveSeconds = Math.round(
      (Date.parse(input.endedAt) - Date.parse(input.startedAt)) / 1_000,
    );
    const activeSeconds = input.activeSeconds ?? calculatedActiveSeconds;
    let inserted: { id: string }[];
    if (input.sourceEventId === null) {
      inserted = await tx<{ id: string }[]>`
        insert into project100_training_blocks
          (id, user_id, session_id, started_at, ended_at, active_seconds,
           environment, location, source, source_event_id, setup_profile_id)
        values
          (${blockId}, ${actor.userId}, ${sessionId}, ${input.startedAt}, ${input.endedAt},
           ${activeSeconds}, ${input.environment}, ${input.location}, ${input.source},
           null, ${input.setupProfileId})
        returning id
      `;
    } else {
      inserted = await tx<{ id: string }[]>`
        insert into project100_training_blocks
          (id, user_id, session_id, started_at, ended_at, active_seconds,
           environment, location, source, source_event_id, setup_profile_id)
        values
          (${blockId}, ${actor.userId}, ${sessionId}, ${input.startedAt}, ${input.endedAt},
           ${activeSeconds}, ${input.environment}, ${input.location}, ${input.source},
           ${input.sourceEventId}, ${input.setupProfileId})
        on conflict (user_id, source, source_event_id)
          where source_event_id is not null
          do nothing
        returning id
      `;
    }

    if (!inserted[0]) {
      const existing = await tx<{ id: string; session_id: string }[]>`
        select id, session_id
        from project100_training_blocks
        where user_id = ${actor.userId} and source = ${input.source}
          and source_event_id = ${input.sourceEventId}
        limit 1
      `;
      if (existing[0]?.session_id !== sessionId) {
        throw new AppError(
          409,
          "PROJECT100_SOURCE_EVENT_CONFLICT",
          "Källhändelsen är redan kopplad till ett annat träningsuppdrag.",
        );
      }
      duplicate = true;
      return;
    }

    for (const exercise of input.exercises) {
      const libraryExerciseId = await upsertExercise(
        tx,
        actor.userId,
        exercise.name,
        exercise.movementPattern,
        exercise.purpose,
      );
      const existingExercise = await tx<{ id: string }[]>`
        select id
        from project100_training_session_exercises
        where user_id = ${actor.userId} and session_id = ${sessionId}
          and exercise_id = ${libraryExerciseId}
        limit 1
      `;
      let sessionExerciseId = existingExercise[0]?.id;
      if (!sessionExerciseId) {
        sessionExerciseId = crypto.randomUUID();
        await tx`
          insert into project100_training_session_exercises
            (id, user_id, session_id, exercise_id, position, notes)
          select ${sessionExerciseId}, ${actor.userId}, ${sessionId}, ${libraryExerciseId},
                 coalesce(max(position), -1) + 1, ${exercise.notes}
          from project100_training_session_exercises
          where user_id = ${actor.userId} and session_id = ${sessionId}
        `;
      }
      const positionRows = await tx<{ next_position: number | string }[]>`
        select coalesce(max(position), -1) + 1 as next_position
        from project100_training_session_sets
        where user_id = ${actor.userId} and session_exercise_id = ${sessionExerciseId}
      `;
      let position = Number(positionRows[0]?.next_position ?? 0);
      for (const set of exercise.sets) {
        await tx`
          insert into project100_training_session_sets
            (id, user_id, session_exercise_id, position,
             actual_reps, actual_weight_kg, actual_duration_seconds,
             actual_distance_meters, actual_rpe, completed, block_id,
             performed_at, source, source_event_id, observation_level, rom_confidence)
          values
            (${crypto.randomUUID()}, ${actor.userId}, ${sessionExerciseId}, ${position},
             ${set.reps}, ${set.weightKg}, ${set.durationSeconds}, ${set.distanceMeters},
             ${set.rpe}, true, ${blockId}, ${set.performedAt}, ${input.source},
             ${set.sourceEventId}, ${set.observationLevel}, ${set.romConfidence})
        `;
        position += 1;
      }
    }

    await tx`
      update project100_training_sessions
      set duration_seconds = (
            select coalesce(sum(active_seconds), 0)
            from project100_training_blocks
            where session_id = ${sessionId} and user_id = ${actor.userId}
          ),
          location = coalesce(${input.location}, location),
          updated_at = now()
      where id = ${sessionId} and user_id = ${actor.userId}
    `;
    await recordAudit(tx, actor, {
      action: "project100.training.block.append",
      targetType: "project100_training_session",
      targetId: sessionId,
      metadata: { source: input.source, environment: input.environment },
    });
  });

  const mission = await loadMission(actor, { id: sessionId });
  if (!mission) {
    throw new AppError(500, "PROJECT100_MISSION_NOT_READABLE", "Träningsuppdraget kunde inte läsas tillbaka.");
  }
  return { duplicate, mission };
}

export async function finishProject100DailyTrainingMission(
  actor: ActorContext,
  sessionId: string,
  input: Project100DailyMissionFinishInput,
): Promise<Project100DailyTrainingMission> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  await sql.begin(async (tx) => {
    const updated = await tx<{ id: string }[]>`
      update project100_training_sessions
      set status = 'completed',
          ended_at = greatest(clock_timestamp(), started_at + interval '1 millisecond'),
          duration_seconds = (
            select coalesce(sum(active_seconds), 0)
            from project100_training_blocks
            where session_id = ${sessionId} and user_id = ${actor.userId}
          ),
          effort = ${input.effort}, body_after = ${input.bodyAfter},
          notes = ${input.notes}, updated_at = now()
      where id = ${sessionId} and user_id = ${actor.userId}
        and mission_type is not null and status = 'in_progress'
      returning id
    `;
    if (!updated[0]) {
      throw new AppError(409, "PROJECT100_MISSION_NOT_OPEN", "Träningsuppdraget är inte öppet.");
    }
    await recordAudit(tx, actor, {
      action: "project100.training.mission.finish",
      targetType: "project100_training_session",
      targetId: sessionId,
    });
  });

  const mission = await loadMission(actor, { id: sessionId });
  if (!mission) {
    throw new AppError(500, "PROJECT100_MISSION_NOT_READABLE", "Träningsuppdraget kunde inte läsas tillbaka.");
  }
  return mission;
}

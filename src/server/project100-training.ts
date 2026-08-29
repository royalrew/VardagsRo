import "server-only";

import type postgres from "postgres";

import { calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import {
  buildProject100TrainingSummary,
  type Project100ActivityType,
  type Project100SetMetrics,
  type Project100TrainingExercise,
  type Project100TrainingSession,
  type Project100TrainingTemplate,
  type Project100TrainingTemplateExercise,
  type Project100TrainingView,
} from "@/lib/project100-training";
import { recordAudit } from "@/server/audit";
import type { ActorContext } from "@/server/authorization-types";
import { readyClient } from "@/server/database";
import { AppError } from "@/server/errors";
import { assertProject100Adult } from "@/server/project100";
import type {
  Project100SessionCreateInput,
  Project100SessionUpdateInput,
  Project100TemplateCreateInput,
} from "@/server/project100-training-schemas";

type TransactionClient = postgres.TransactionSql;

const SESSION_LIMIT = 60;
const TEMPLATE_LIMIT = 30;

interface SessionRow {
  id: string;
  source_template_id: string | null;
  title: string;
  activity_type: Project100ActivityType;
  status: Project100TrainingSession["status"];
  session_date: string;
  planned_start_at: Date | string | null;
  planned_end_at: Date | string | null;
  started_at: Date | string | null;
  ended_at: Date | string | null;
  duration_seconds: number | null;
  location: string | null;
  effort: number | null;
  body_before: string | null;
  body_after: string | null;
  notes: string | null;
  created_at: Date | string;
}

interface SessionExerciseRow {
  id: string;
  session_id: string;
  exercise_id: string;
  name: string;
  position: number;
  notes: string | null;
}

interface SessionSetRow {
  id: string;
  session_exercise_id: string;
  position: number;
  target_reps: number | string | null;
  target_weight_kg: number | string | null;
  target_duration_seconds: number | string | null;
  target_distance_meters: number | string | null;
  target_rpe: number | string | null;
  actual_reps: number | string | null;
  actual_weight_kg: number | string | null;
  actual_duration_seconds: number | string | null;
  actual_distance_meters: number | string | null;
  actual_rpe: number | string | null;
  completed: boolean;
}

interface TemplateRow {
  id: string;
  name: string;
  activity_type: Project100ActivityType;
  description: string | null;
  created_at: Date | string;
}

interface TemplateExerciseRow {
  id: string;
  template_id: string;
  exercise_id: string;
  name: string;
  position: number;
  notes: string | null;
}

interface TemplateSetRow {
  id: string;
  template_exercise_id: string;
  position: number;
  target_reps: number | string | null;
  target_weight_kg: number | string | null;
  target_duration_seconds: number | string | null;
  target_distance_meters: number | string | null;
  target_rpe: number | string | null;
}

interface TemplateTargetRow extends TemplateSetRow {
  exercise_position: number;
}

function asIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metrics(
  prefix: "target" | "actual",
  row: SessionSetRow | TemplateSetRow,
): Project100SetMetrics | null {
  const source = row as SessionSetRow;
  const value: Project100SetMetrics = {
    reps: asNumber(source[`${prefix}_reps`]),
    weightKg: asNumber(source[`${prefix}_weight_kg`]),
    durationSeconds: asNumber(source[`${prefix}_duration_seconds`]),
    distanceMeters: asNumber(source[`${prefix}_distance_meters`]),
    rpe: asNumber(source[`${prefix}_rpe`]),
  };
  return Object.values(value).some((item) => item !== null) ? value : null;
}

function sessionDate(value: string): string {
  return value.slice(0, 10);
}

function mapSessions(
  sessions: SessionRow[],
  exercises: SessionExerciseRow[],
  sets: SessionSetRow[],
): Project100TrainingSession[] {
  const setsByExercise = new Map<string, SessionSetRow[]>();
  for (const set of sets) {
    const list = setsByExercise.get(set.session_exercise_id) ?? [];
    list.push(set);
    setsByExercise.set(set.session_exercise_id, list);
  }

  const exercisesBySession = new Map<string, Project100TrainingExercise[]>();
  for (const exercise of exercises) {
    const list = exercisesBySession.get(exercise.session_id) ?? [];
    list.push({
      id: exercise.id,
      exerciseId: exercise.exercise_id,
      name: exercise.name,
      position: exercise.position,
      notes: exercise.notes,
      sets: (setsByExercise.get(exercise.id) ?? []).map((set) => ({
        id: set.id,
        position: set.position,
        target: metrics("target", set),
        actual: metrics("actual", set),
        completed: set.completed,
      })),
    });
    exercisesBySession.set(exercise.session_id, list);
  }

  return sessions.map((row) => ({
    id: row.id,
    sourceTemplateId: row.source_template_id,
    title: row.title,
    activityType: row.activity_type,
    status: row.status,
    sessionDate: sessionDate(row.session_date),
    plannedStartAt: asIso(row.planned_start_at),
    plannedEndAt: asIso(row.planned_end_at),
    startedAt: asIso(row.started_at),
    endedAt: asIso(row.ended_at),
    durationSeconds: asNumber(row.duration_seconds),
    location: row.location,
    effort: row.effort,
    bodyBefore: row.body_before,
    bodyAfter: row.body_after,
    notes: row.notes,
    createdAt: asIso(row.created_at) as string,
    exercises: exercisesBySession.get(row.id) ?? [],
  }));
}

function mapTemplates(
  templates: TemplateRow[],
  exercises: TemplateExerciseRow[],
  sets: TemplateSetRow[],
): Project100TrainingTemplate[] {
  const setsByExercise = new Map<string, TemplateSetRow[]>();
  for (const set of sets) {
    const list = setsByExercise.get(set.template_exercise_id) ?? [];
    list.push(set);
    setsByExercise.set(set.template_exercise_id, list);
  }

  const exercisesByTemplate = new Map<string, Project100TrainingTemplateExercise[]>();
  for (const exercise of exercises) {
    const list = exercisesByTemplate.get(exercise.template_id) ?? [];
    list.push({
      id: exercise.id,
      exerciseId: exercise.exercise_id,
      name: exercise.name,
      position: exercise.position,
      notes: exercise.notes,
      sets: (setsByExercise.get(exercise.id) ?? []).map((set) => ({
        id: set.id,
        position: set.position,
        target: metrics("target", set) as Project100SetMetrics,
      })),
    });
    exercisesByTemplate.set(exercise.template_id, list);
  }

  return templates.map((row) => ({
    id: row.id,
    name: row.name,
    activityType: row.activity_type,
    description: row.description,
    createdAt: asIso(row.created_at) as string,
    exercises: exercisesByTemplate.get(row.id) ?? [],
  }));
}

export async function loadProject100TrainingSessions(
  actor: ActorContext,
): Promise<Project100TrainingSession[]> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const rows = await sql<SessionRow[]>`
    select id, source_template_id, title, activity_type, status,
           to_char(session_date, 'YYYY-MM-DD') as session_date,
           planned_start_at, planned_end_at, started_at, ended_at,
           duration_seconds, location, effort, body_before, body_after,
           notes, created_at
    from project100_training_sessions
    where user_id = ${actor.userId}
    order by session_date desc, created_at desc, id desc
    limit ${SESSION_LIMIT}
  `;
  if (rows.length === 0) return [];

  const [exerciseRows, setRows] = await Promise.all([
    sql<SessionExerciseRow[]>`
      select se.id, se.session_id, se.exercise_id, e.name, se.position, se.notes
      from project100_training_session_exercises se
      join project100_exercises e
        on e.id = se.exercise_id and e.user_id = se.user_id
      join project100_training_sessions s
        on s.id = se.session_id and s.user_id = se.user_id
      where se.user_id = ${actor.userId}
        and s.id in (
          select id from project100_training_sessions
          where user_id = ${actor.userId}
          order by session_date desc, created_at desc, id desc
          limit ${SESSION_LIMIT}
        )
      order by se.session_id, se.position, se.id
    `,
    sql<SessionSetRow[]>`
      select ss.id, ss.session_exercise_id, ss.position,
             ss.target_reps, ss.target_weight_kg, ss.target_duration_seconds,
             ss.target_distance_meters, ss.target_rpe,
             ss.actual_reps, ss.actual_weight_kg, ss.actual_duration_seconds,
             ss.actual_distance_meters, ss.actual_rpe, ss.completed
      from project100_training_session_sets ss
      join project100_training_session_exercises se
        on se.id = ss.session_exercise_id and se.user_id = ss.user_id
      join project100_training_sessions s
        on s.id = se.session_id and s.user_id = se.user_id
      where ss.user_id = ${actor.userId}
        and s.id in (
          select id from project100_training_sessions
          where user_id = ${actor.userId}
          order by session_date desc, created_at desc, id desc
          limit ${SESSION_LIMIT}
        )
      order by ss.session_exercise_id, ss.position, ss.id
    `,
  ]);

  return mapSessions(rows, exerciseRows, setRows);
}

export async function loadProject100TrainingTemplates(
  actor: ActorContext,
): Promise<Project100TrainingTemplate[]> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const rows = await sql<TemplateRow[]>`
    select id, name, activity_type, description, created_at
    from project100_training_templates
    where user_id = ${actor.userId} and archived_at is null
    order by updated_at desc, id desc
    limit ${TEMPLATE_LIMIT}
  `;
  if (rows.length === 0) return [];

  const [exerciseRows, setRows] = await Promise.all([
    sql<TemplateExerciseRow[]>`
      select te.id, te.template_id, te.exercise_id, e.name, te.position, te.notes
      from project100_training_template_exercises te
      join project100_exercises e
        on e.id = te.exercise_id and e.user_id = te.user_id
      join project100_training_templates t
        on t.id = te.template_id and t.user_id = te.user_id
      where te.user_id = ${actor.userId} and t.archived_at is null
      order by te.template_id, te.position, te.id
    `,
    sql<TemplateSetRow[]>`
      select ts.id, ts.template_exercise_id, ts.position,
             ts.target_reps, ts.target_weight_kg, ts.target_duration_seconds,
             ts.target_distance_meters, ts.target_rpe
      from project100_training_template_sets ts
      join project100_training_template_exercises te
        on te.id = ts.template_exercise_id and te.user_id = ts.user_id
      join project100_training_templates t
        on t.id = te.template_id and t.user_id = te.user_id
      where ts.user_id = ${actor.userId} and t.archived_at is null
      order by ts.template_exercise_id, ts.position, ts.id
    `,
  ]);

  return mapTemplates(rows, exerciseRows, setRows);
}

export async function loadProject100TrainingView(
  actor: ActorContext,
  today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE),
): Promise<Project100TrainingView> {
  assertProject100Adult(actor);
  const [sessions, templates] = await Promise.all([
    loadProject100TrainingSessions(actor),
    loadProject100TrainingTemplates(actor),
  ]);
  return {
    today,
    sessions,
    templates,
    summary: buildProject100TrainingSummary(sessions, today),
  };
}

function normalizedExerciseName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("sv-SE");
}

async function exerciseId(
  sql: TransactionClient,
  userId: string,
  name: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const rows = await sql<{ id: string }[]>`
    insert into project100_exercises (id, user_id, name, normalized_name)
    values (${id}, ${userId}, ${name}, ${normalizedExerciseName(name)})
    on conflict (user_id, normalized_name) do update
      set name = excluded.name, archived_at = null, updated_at = now()
    returning id
  `;
  return rows[0].id;
}

async function templateTargets(
  sql: TransactionClient,
  userId: string,
  templateId: string,
): Promise<Map<string, Project100SetMetrics>> {
  const templateRows = await sql<{ id: string }[]>`
    select id from project100_training_templates
    where id = ${templateId} and user_id = ${userId} and archived_at is null
    limit 1
  `;
  if (!templateRows[0]) {
    throw new AppError(404, "PROJECT100_TEMPLATE_NOT_FOUND", "Mallen finns inte.");
  }
  const rows = await sql<TemplateTargetRow[]>`
    select te.position as exercise_position, ts.id, ts.template_exercise_id,
           ts.position, ts.target_reps, ts.target_weight_kg,
           ts.target_duration_seconds, ts.target_distance_meters, ts.target_rpe
    from project100_training_template_exercises te
    join project100_training_template_sets ts
      on ts.template_exercise_id = te.id and ts.user_id = te.user_id
    where te.template_id = ${templateId} and te.user_id = ${userId}
    order by te.position, ts.position
  `;
  return new Map(
    rows.map((row) => [
      `${row.exercise_position}:${row.position}`,
      metrics("target", row) as Project100SetMetrics,
    ]),
  );
}

export async function createProject100TrainingSession(
  actor: ActorContext,
  input: Project100SessionCreateInput,
): Promise<Project100TrainingSession> {
  assertProject100Adult(actor);
  const today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  if (input.status === "completed" && input.sessionDate > today) {
    throw new AppError(
      400,
      "PROJECT100_FUTURE_SESSION",
      "Ett genomfört pass kan inte ligga i framtiden.",
    );
  }

  const sessionId = crypto.randomUUID();
  const sql = await readyClient();
  await sql.begin(async (tx) => {
    const copiedTargets = input.templateId
      ? await templateTargets(tx, actor.userId, input.templateId)
      : new Map<string, Project100SetMetrics>();

    await tx`
      insert into project100_training_sessions
        (id, user_id, source_template_id, title, activity_type, status,
         session_date, planned_start_at, planned_end_at, duration_seconds,
         location, effort, body_before, body_after, notes)
      values
        (${sessionId}, ${actor.userId}, ${input.templateId}, ${input.title},
         ${input.activityType}, ${input.status}, ${input.sessionDate},
         ${input.plannedStartAt}, ${input.plannedEndAt}, ${input.durationSeconds},
         ${input.location}, ${input.effort}, ${input.bodyBefore},
         ${input.bodyAfter}, ${input.notes})
    `;

    for (const [exercisePosition, exercise] of input.exercises.entries()) {
      const libraryExerciseId = await exerciseId(tx, actor.userId, exercise.name);
      const sessionExerciseId = crypto.randomUUID();
      await tx`
        insert into project100_training_session_exercises
          (id, user_id, session_id, exercise_id, position, notes)
        values
          (${sessionExerciseId}, ${actor.userId}, ${sessionId},
           ${libraryExerciseId}, ${exercisePosition}, ${exercise.notes})
      `;

      for (const [setPosition, set] of exercise.sets.entries()) {
        const target =
          input.status === "planned"
            ? set
            : copiedTargets.get(`${exercisePosition}:${setPosition}`) ?? null;
        const actual = input.status === "completed" ? set : null;
        await tx`
          insert into project100_training_session_sets
            (id, user_id, session_exercise_id, position,
             target_reps, target_weight_kg, target_duration_seconds,
             target_distance_meters, target_rpe,
             actual_reps, actual_weight_kg, actual_duration_seconds,
             actual_distance_meters, actual_rpe, completed)
          values
            (${crypto.randomUUID()}, ${actor.userId}, ${sessionExerciseId}, ${setPosition},
             ${target?.reps ?? null}, ${target?.weightKg ?? null},
             ${target?.durationSeconds ?? null}, ${target?.distanceMeters ?? null},
             ${target?.rpe ?? null}, ${actual?.reps ?? null},
             ${actual?.weightKg ?? null}, ${actual?.durationSeconds ?? null},
             ${actual?.distanceMeters ?? null}, ${actual?.rpe ?? null},
             ${input.status === "completed"})
        `;
      }
    }

    await recordAudit(tx, actor, {
      action: "project100.training.session.create",
      targetType: "project100_training_session",
      targetId: sessionId,
    });
  });

  const sessions = await loadProject100TrainingSessions(actor);
  const created = sessions.find((session) => session.id === sessionId);
  if (!created) {
    throw new AppError(500, "PROJECT100_SESSION_NOT_READABLE", "Passet kunde inte läsas tillbaka.");
  }
  return created;
}

export async function createProject100TrainingTemplate(
  actor: ActorContext,
  input: Project100TemplateCreateInput,
): Promise<Project100TrainingTemplate> {
  assertProject100Adult(actor);
  const templateId = crypto.randomUUID();
  const sql = await readyClient();
  await sql.begin(async (tx) => {
    const duplicate = await tx<{ id: string }[]>`
      select id from project100_training_templates
      where user_id = ${actor.userId}
        and lower(btrim(name)) = lower(btrim(${input.name}))
        and archived_at is null
      limit 1
    `;
    if (duplicate[0]) {
      throw new AppError(409, "PROJECT100_TEMPLATE_NAME_EXISTS", "Du har redan en aktiv mall med det namnet.");
    }

    await tx`
      insert into project100_training_templates
        (id, user_id, name, activity_type, description)
      values
        (${templateId}, ${actor.userId}, ${input.name},
         ${input.activityType}, ${input.description})
    `;

    for (const [exercisePosition, exercise] of input.exercises.entries()) {
      const libraryExerciseId = await exerciseId(tx, actor.userId, exercise.name);
      const templateExerciseId = crypto.randomUUID();
      await tx`
        insert into project100_training_template_exercises
          (id, user_id, template_id, exercise_id, position, notes)
        values
          (${templateExerciseId}, ${actor.userId}, ${templateId},
           ${libraryExerciseId}, ${exercisePosition}, ${exercise.notes})
      `;
      for (const [setPosition, set] of exercise.sets.entries()) {
        await tx`
          insert into project100_training_template_sets
            (id, user_id, template_exercise_id, position, target_reps,
             target_weight_kg, target_duration_seconds, target_distance_meters,
             target_rpe)
          values
            (${crypto.randomUUID()}, ${actor.userId}, ${templateExerciseId},
             ${setPosition}, ${set.reps}, ${set.weightKg},
             ${set.durationSeconds}, ${set.distanceMeters}, ${set.rpe})
        `;
      }
    }

    await recordAudit(tx, actor, {
      action: "project100.training.template.create",
      targetType: "project100_training_template",
      targetId: templateId,
    });
  });

  const templates = await loadProject100TrainingTemplates(actor);
  const created = templates.find((template) => template.id === templateId);
  if (!created) {
    throw new AppError(500, "PROJECT100_TEMPLATE_NOT_READABLE", "Mallen kunde inte läsas tillbaka.");
  }
  return created;
}

/**
 * Carries out, moves or drops a session that was planned earlier.
 *
 * The target columns are never touched here. What was intended stays readable
 * next to what happened, which is the only way the history can later say that a
 * heavy week was cut short rather than that it was always meant to be light.
 */
export async function updateProject100TrainingSession(
  actor: ActorContext,
  id: string,
  input: Project100SessionUpdateInput,
): Promise<Project100TrainingSession> {
  assertProject100Adult(actor);
  const today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  if (input.action === "complete" && input.sessionDate > today) {
    throw new AppError(
      400,
      "PROJECT100_FUTURE_SESSION",
      "Ett genomfört pass kan inte ligga i framtiden.",
    );
  }

  const sql = await readyClient();
  await sql.begin(async (tx) => {
    const current = await tx<{ status: Project100TrainingSession["status"] }[]>`
      select status from project100_training_sessions
      where id = ${id} and user_id = ${actor.userId}
      limit 1
      for update
    `;
    const status = current[0]?.status;
    if (!status) {
      throw new AppError(404, "PROJECT100_SESSION_NOT_FOUND", "Passet finns inte.");
    }
    if (status !== "planned" && status !== "in_progress") {
      throw new AppError(
        409,
        "PROJECT100_SESSION_NOT_PLANNED",
        "Bara ett planerat pass kan genomföras, flyttas eller hoppas över.",
      );
    }

    if (input.action === "move") {
      await tx`
        update project100_training_sessions
        set session_date = ${input.sessionDate},
            planned_start_at = ${input.plannedStartAt},
            planned_end_at = ${input.plannedEndAt},
            updated_at = now()
        where id = ${id} and user_id = ${actor.userId}
      `;
    } else if (input.action === "skip") {
      await tx`
        update project100_training_sessions
        set status = 'skipped',
            notes = ${input.notes},
            started_at = null,
            ended_at = null,
            updated_at = now()
        where id = ${id} and user_id = ${actor.userId}
      `;
    } else {
      for (const set of input.sets) {
        // The session id is part of the condition, so a set id from another
        // session of the same account still cannot be written through here.
        await tx`
          update project100_training_session_sets
          set actual_reps = ${set.reps},
              actual_weight_kg = ${set.weightKg},
              actual_duration_seconds = ${set.durationSeconds},
              actual_distance_meters = ${set.distanceMeters},
              actual_rpe = ${set.rpe},
              completed = ${set.completed}
          where id = ${set.id}
            and user_id = ${actor.userId}
            and session_exercise_id in (
              select id from project100_training_session_exercises
              where session_id = ${id} and user_id = ${actor.userId}
            )
        `;
      }
      await tx`
        update project100_training_sessions
        set status = 'completed',
            session_date = ${input.sessionDate},
            duration_seconds = ${input.durationSeconds},
            location = ${input.location},
            effort = ${input.effort},
            body_before = ${input.bodyBefore},
            body_after = ${input.bodyAfter},
            notes = ${input.notes},
            started_at = null,
            ended_at = null,
            updated_at = now()
        where id = ${id} and user_id = ${actor.userId}
      `;
    }

    await recordAudit(tx, actor, {
      action: "project100.training.session.update",
      targetType: "project100_training_session",
      targetId: id,
      metadata: { change: input.action },
    });
  });

  const sessions = await loadProject100TrainingSessions(actor);
  const updated = sessions.find((session) => session.id === id);
  if (!updated) {
    throw new AppError(500, "PROJECT100_SESSION_NOT_READABLE", "Passet kunde inte läsas tillbaka.");
  }
  return updated;
}

export async function deleteProject100TrainingSession(
  actor: ActorContext,
  id: string,
): Promise<boolean> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  return sql.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      delete from project100_training_sessions
      where id = ${id} and user_id = ${actor.userId}
      returning id
    `;
    if (!rows[0]) return false;
    await recordAudit(tx, actor, {
      action: "project100.training.session.delete",
      targetType: "project100_training_session",
      targetId: id,
    });
    return true;
  });
}

export async function archiveProject100TrainingTemplate(
  actor: ActorContext,
  id: string,
): Promise<boolean> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  return sql.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      update project100_training_templates
      set archived_at = now(), updated_at = now()
      where id = ${id} and user_id = ${actor.userId} and archived_at is null
      returning id
    `;
    if (!rows[0]) return false;
    await recordAudit(tx, actor, {
      action: "project100.training.template.delete",
      targetType: "project100_training_template",
      targetId: id,
    });
    return true;
  });
}

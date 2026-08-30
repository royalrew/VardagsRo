import "server-only";

import {
  buildProject100StrengthDevelopment,
  PROJECT100_MUSCLE_GROUPS,
  type Project100MuscleGroup,
  type Project100StrengthDevelopment,
  type Project100StrengthPeriod,
  type Project100StrengthSetSource,
} from "@/lib/project100-strength";
import type { Project100SessionStatus } from "@/lib/project100-training";
import type { ActorContext } from "@/server/authorization-types";
import { recordAudit } from "@/server/audit";
import { readyClient } from "@/server/database";
import { AppError } from "@/server/errors";
import { assertProject100Adult } from "@/server/project100";

interface StrengthSetRow {
  set_id: string;
  exercise_id: string;
  exercise_name: string;
  muscle_groups: string[] | null;
  session_id: string;
  session_title: string;
  session_date: string;
  session_status: Project100SessionStatus;
  set_completed: boolean;
  actual_reps: number | string | null;
  actual_weight_kg: number | string | null;
  actual_duration_seconds: number | string | null;
  actual_distance_meters: number | string | null;
}

function asNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function muscleGroups(value: string[] | null): Project100MuscleGroup[] {
  const found = new Set(value ?? []);
  return PROJECT100_MUSCLE_GROUPS.filter((muscleGroup) => found.has(muscleGroup));
}

function mapRow(row: StrengthSetRow): Project100StrengthSetSource {
  return {
    setId: row.set_id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    muscleGroups: muscleGroups(row.muscle_groups),
    sessionId: row.session_id,
    sessionTitle: row.session_title,
    sessionDate: row.session_date.slice(0, 10),
    sessionStatus: row.session_status,
    setCompleted: row.set_completed,
    actualReps: asNumber(row.actual_reps),
    actualWeightKg: asNumber(row.actual_weight_kg),
    actualDurationSeconds: asNumber(row.actual_duration_seconds),
    actualDistanceMeters: asNumber(row.actual_distance_meters),
  };
}

/**
 * Reads every qualifying set up to the selected period's end. There is no
 * lower SQL bound on purpose: the pure builder needs the earlier rows to know
 * whether a visible value is genuinely a personal best.
 */
export async function loadProject100StrengthDevelopment(
  actor: ActorContext,
  period: Project100StrengthPeriod,
): Promise<Project100StrengthDevelopment> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const rows = await sql<StrengthSetRow[]>`
    select ss.id as set_id,
           e.id as exercise_id,
           e.name as exercise_name,
           e.muscle_groups,
           s.id as session_id,
           s.title as session_title,
           to_char(s.session_date, 'YYYY-MM-DD') as session_date,
           s.status as session_status,
           ss.completed as set_completed,
           ss.actual_reps,
           ss.actual_weight_kg,
           ss.actual_duration_seconds,
           ss.actual_distance_meters
    from project100_training_sessions s
    join project100_training_session_exercises se
      on se.session_id = s.id and se.user_id = s.user_id
    join project100_training_session_sets ss
      on ss.session_exercise_id = se.id and ss.user_id = se.user_id
    join project100_exercises e
      on e.id = se.exercise_id and e.user_id = se.user_id
    where s.user_id = ${actor.userId}
      and se.user_id = ${actor.userId}
      and ss.user_id = ${actor.userId}
      and e.user_id = ${actor.userId}
      and s.status = 'completed'
      and ss.completed = true
      and s.session_date <= ${period.to}
      and (
        ss.actual_reps > 0 or ss.actual_duration_seconds > 0 or
        ss.actual_distance_meters > 0
      )
    order by s.session_date asc, s.created_at asc, s.id asc,
             se.position asc, ss.position asc, ss.id asc
  `;

  return buildProject100StrengthDevelopment(rows.map(mapRow), period);
}

export async function saveProject100ExerciseMuscleGroups(
  actor: ActorContext,
  exerciseId: string,
  input: Project100MuscleGroup[],
): Promise<Project100MuscleGroup[]> {
  assertProject100Adult(actor);
  const selected = new Set(input);
  const groups = PROJECT100_MUSCLE_GROUPS.filter((muscleGroup) => selected.has(muscleGroup));
  const sql = await readyClient();

  return sql.begin(async (tx) => {
    const rows = await tx<{ muscle_groups: string[] | null }[]>`
      update project100_exercises
      set muscle_groups = ${groups}, updated_at = now()
      where id = ${exerciseId} and user_id = ${actor.userId}
      returning muscle_groups
    `;
    if (!rows[0]) {
      throw new AppError(404, "PROJECT100_EXERCISE_NOT_FOUND", "Övningen finns inte.");
    }
    await recordAudit(tx, actor, {
      action: "project100.training.exercise.muscles.update",
      targetType: "project100_exercise",
      targetId: exerciseId,
      metadata: { groups: groups.length },
    });
    return muscleGroups(rows[0].muscle_groups);
  });
}

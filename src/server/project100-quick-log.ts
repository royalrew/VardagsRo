import "server-only";

import { calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import { recordAudit } from "@/server/audit";
import type { ActorContext } from "@/server/authorization-types";
import { readyClient } from "@/server/database";
import { AppError } from "@/server/errors";
import { assertProject100Adult } from "@/server/project100";
import type {
  Project100QuickLogInput,
  Project100QuickLogResult,
} from "@/server/project100-quick-log-schemas";

interface ExistingJournalRow {
  written_on: string;
  body: string | null;
  mood: number | null;
  energy: number | null;
  sleep_hours: number | string | null;
  excluded_from_ai: boolean;
}

interface TemplateExerciseSetRow {
  te_id: string;
  exercise_id: string;
  exercise_name: string;
  exercise_position: number;
  exercise_notes: string | null;
  ts_id: string;
  set_position: number;
  target_reps: number | string | null;
  target_weight_kg: number | string | null;
  target_duration_seconds: number | string | null;
  target_distance_meters: number | string | null;
  target_rpe: number | string | null;
}

function normalizedExerciseName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("sv-SE");
}

function asNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function executeProject100QuickLog(
  actor: ActorContext,
  input: Project100QuickLogInput,
): Promise<Project100QuickLogResult> {
  assertProject100Adult(actor);

  const today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  const sessionDate = input.workout.sessionDate;

  if (sessionDate > today) {
    throw new AppError(
      400,
      "PROJECT100_FUTURE_SESSION",
      "Ett genomfört pass kan inte ligga i framtiden.",
    );
  }

  const sql = await readyClient();

  return await sql.begin(async (tx) => {
    let sessionId: string;
    let sessionTitle: string;
    const workoutMode = input.workout.mode;

    // -------------------------------------------------------------
    // 1. Träning (Workout Session)
    // -------------------------------------------------------------
    if (input.workout.mode === "planned") {
      const plannedId = input.workout.plannedSessionId;
      const currentRows = await tx<{ id: string; title: string; status: string }[]>`
        select id, title, status
        from project100_training_sessions
        where id = ${plannedId} and user_id = ${actor.userId}
        limit 1
        for update
      `;

      const current = currentRows[0];
      if (!current) {
        throw new AppError(404, "PROJECT100_SESSION_NOT_FOUND", "Det planerade passet finns inte.");
      }
      if (current.status !== "planned" && current.status !== "in_progress") {
        throw new AppError(
          409,
          "PROJECT100_SESSION_NOT_PLANNED",
          "Bara ett planerat pass kan klarmarkeras via snabbspåret.",
        );
      }

      sessionId = plannedId;
      sessionTitle = current.title;

      if (input.workout.followedPlan) {
        // Copy target values to actual values only when explicitly confirmed
        await tx`
          update project100_training_session_sets
          set actual_reps = target_reps,
              actual_weight_kg = target_weight_kg,
              actual_duration_seconds = target_duration_seconds,
              actual_distance_meters = target_distance_meters,
              actual_rpe = target_rpe,
              completed = true
          where user_id = ${actor.userId}
            and session_exercise_id in (
              select id from project100_training_session_exercises
              where session_id = ${plannedId} and user_id = ${actor.userId}
            )
        `;
      } else {
        // Without explicit confirmation, actual values remain null
        await tx`
          update project100_training_session_sets
          set completed = true
          where user_id = ${actor.userId}
            and session_exercise_id in (
              select id from project100_training_session_exercises
              where session_id = ${plannedId} and user_id = ${actor.userId}
            )
        `;
      }

      const durationSeconds = input.workout.durationMinutes
        ? input.workout.durationMinutes * 60
        : null;

      await tx`
        update project100_training_sessions
        set status = 'completed',
            session_date = ${sessionDate},
            duration_seconds = coalesce(${durationSeconds}, duration_seconds),
            effort = ${input.workout.effort},
            notes = coalesce(${input.workout.notes}, notes),
            started_at = null,
            ended_at = null,
            updated_at = now()
        where id = ${plannedId} and user_id = ${actor.userId}
      `;

      await recordAudit(tx, actor, {
        action: "project100.training.session.update",
        targetType: "project100_training_session",
        targetId: plannedId,
        metadata: { quickLog: true, completedPlanned: true },
      });
    } else if (input.workout.mode === "template") {
      const templateRows = await tx<{ id: string; name: string; activity_type: string }[]>`
        select id, name, activity_type
        from project100_training_templates
        where id = ${input.workout.templateId} and user_id = ${actor.userId} and archived_at is null
        limit 1
      `;
      const template = templateRows[0];
      if (!template) {
        throw new AppError(404, "PROJECT100_TEMPLATE_NOT_FOUND", "Mallen finns inte.");
      }

      sessionId = crypto.randomUUID();
      sessionTitle = input.workout.title || template.name;
      const durationSeconds = input.workout.durationMinutes
        ? input.workout.durationMinutes * 60
        : null;

      await tx`
        insert into project100_training_sessions
          (id, user_id, source_template_id, title, activity_type, status,
           session_date, duration_seconds, effort, notes)
        values
          (${sessionId}, ${actor.userId}, ${template.id}, ${sessionTitle},
           ${template.activity_type}, 'completed', ${sessionDate},
           ${durationSeconds}, ${input.workout.effort}, ${input.workout.notes})
      `;

      const rows = await tx<TemplateExerciseSetRow[]>`
        select te.id as te_id, te.exercise_id, e.name as exercise_name,
               te.position as exercise_position, te.notes as exercise_notes,
               ts.id as ts_id, ts.position as set_position,
               ts.target_reps, ts.target_weight_kg, ts.target_duration_seconds,
               ts.target_distance_meters, ts.target_rpe
        from project100_training_template_exercises te
        join project100_exercises e
          on e.id = te.exercise_id and e.user_id = te.user_id
        join project100_training_template_sets ts
          on ts.template_exercise_id = te.id and ts.user_id = te.user_id
        where te.template_id = ${template.id} and te.user_id = ${actor.userId}
        order by te.position, ts.position
      `;

      // Group sets by exercise
      const exerciseMap = new Map<string, {
        exerciseId: string;
        exerciseName: string;
        position: number;
        notes: string | null;
        sets: TemplateExerciseSetRow[];
      }>();

      for (const row of rows) {
        let ex = exerciseMap.get(row.te_id);
        if (!ex) {
          ex = {
            exerciseId: row.exercise_id,
            exerciseName: row.exercise_name,
            position: row.exercise_position,
            notes: row.exercise_notes,
            sets: [],
          };
          exerciseMap.set(row.te_id, ex);
        }
        ex.sets.push(row);
      }

      for (const ex of exerciseMap.values()) {
        const sessionExerciseId = crypto.randomUUID();
        await tx`
          insert into project100_training_session_exercises
            (id, user_id, session_id, exercise_id, position, notes)
          values
            (${sessionExerciseId}, ${actor.userId}, ${sessionId},
             ${ex.exerciseId}, ${ex.position}, ${ex.notes})
        `;

        for (const s of ex.sets) {
          const targetReps = asNumber(s.target_reps);
          const targetWeight = asNumber(s.target_weight_kg);
          const targetDur = asNumber(s.target_duration_seconds);
          const targetDist = asNumber(s.target_distance_meters);
          const targetRpe = asNumber(s.target_rpe);

          // Actual values are ONLY set if user explicitly checked followedPlan
          const actualReps = input.workout.followedPlan ? targetReps : null;
          const actualWeight = input.workout.followedPlan ? targetWeight : null;
          const actualDur = input.workout.followedPlan ? targetDur : null;
          const actualDist = input.workout.followedPlan ? targetDist : null;
          const actualRpe = input.workout.followedPlan ? targetRpe : null;

          await tx`
            insert into project100_training_session_sets
              (id, user_id, session_exercise_id, position,
               target_reps, target_weight_kg, target_duration_seconds,
               target_distance_meters, target_rpe,
               actual_reps, actual_weight_kg, actual_duration_seconds,
               actual_distance_meters, actual_rpe, completed)
            values
              (${crypto.randomUUID()}, ${actor.userId}, ${sessionExerciseId}, ${s.set_position},
               ${targetReps}, ${targetWeight}, ${targetDur}, ${targetDist}, ${targetRpe},
               ${actualReps}, ${actualWeight}, ${actualDur}, ${actualDist}, ${actualRpe}, true)
          `;
        }
      }

      await recordAudit(tx, actor, {
        action: "project100.training.session.create",
        targetType: "project100_training_session",
        targetId: sessionId,
        metadata: { quickLog: true, fromTemplate: true },
      });
    } else {
      // mode === "custom"
      sessionId = crypto.randomUUID();
      sessionTitle = input.workout.title;
      const durationSeconds = input.workout.durationMinutes
        ? input.workout.durationMinutes * 60
        : null;

      await tx`
        insert into project100_training_sessions
          (id, user_id, source_template_id, title, activity_type, status,
           session_date, duration_seconds, effort, notes)
        values
          (${sessionId}, ${actor.userId}, null, ${sessionTitle},
           ${input.workout.activityType}, 'completed', ${sessionDate},
           ${durationSeconds}, ${input.workout.effort}, ${input.workout.notes})
      `;

      await recordAudit(tx, actor, {
        action: "project100.training.session.create",
        targetType: "project100_training_session",
        targetId: sessionId,
        metadata: { quickLog: true, custom: true },
      });
    }

    // -------------------------------------------------------------
    // 2. Dagbok / Dagsform (Smart merge with existing journal entry)
    // -------------------------------------------------------------
    let journalUpdated = false;
    let loggedEnergy: number | null = null;

    if (
      input.journal &&
      (input.journal.energy !== null ||
        input.journal.mood !== null ||
        (input.journal.reflection !== null && input.journal.reflection.trim().length > 0))
    ) {
      const existingRows = await tx<ExistingJournalRow[]>`
        select to_char(written_on, 'YYYY-MM-DD') as written_on, body, mood, energy,
               sleep_hours, excluded_from_ai
        from project100_journal_entries
        where user_id = ${actor.userId} and written_on = ${sessionDate}
        limit 1
        for update
      `;

      const existing = existingRows[0];
      const newReflection = input.journal.reflection?.trim() || null;

      let mergedBody: string | null = null;
      if (newReflection) {
        if (existing?.body && existing.body.trim().length > 0) {
          if (!existing.body.includes(newReflection)) {
            mergedBody = `${existing.body.trim()}\n\n${newReflection}`;
          } else {
            mergedBody = existing.body;
          }
        } else {
          mergedBody = newReflection;
        }
      } else {
        mergedBody = existing?.body ?? null;
      }

      const mergedEnergy = input.journal.energy ?? existing?.energy ?? null;
      const mergedMood = input.journal.mood ?? existing?.mood ?? null;
      const preservedSleep = existing ? asNumber(existing.sleep_hours) : null;
      const preservedExcluded = existing?.excluded_from_ai ?? false;

      loggedEnergy = mergedEnergy;

      await tx`
        insert into project100_journal_entries
          (user_id, written_on, body, mood, energy, sleep_hours, excluded_from_ai)
        values
          (${actor.userId}, ${sessionDate}, ${mergedBody}, ${mergedMood},
           ${mergedEnergy}, ${preservedSleep}, ${preservedExcluded})
        on conflict (user_id, written_on) do update
          set body = excluded.body,
              mood = excluded.mood,
              energy = excluded.energy,
              sleep_hours = excluded.sleep_hours,
              excluded_from_ai = excluded.excluded_from_ai,
              updated_at = now()
      `;

      await recordAudit(tx, actor, {
        action: "project100.journal.save",
        targetType: "project100_journal_entry",
        targetId: sessionDate,
        metadata: { quickLog: true },
      });

      journalUpdated = true;
    }

    // -------------------------------------------------------------
    // 3. Post-workout Proteinshake (Manual Meal)
    // -------------------------------------------------------------
    let proteinAddedG: number | null = null;

    if (input.proteinShake?.enabled && input.proteinShake.proteinG > 0) {
      const mealId = crypto.randomUUID();
      const shakeTitle = input.proteinShake.title || "Post-workout Proteinshake";
      const proteinG = input.proteinShake.proteinG;
      const kcal = input.proteinShake.kcal ?? Math.round(proteinG * 4.5);

      await tx`
        insert into project100_meals
          (id, user_id, eaten_on, eaten_at_minute, meal_type, title, source,
           protein_g, carbs_g, fat_g, kcal)
        values
          (${mealId}, ${actor.userId}, ${sessionDate}, null, 'snack', ${shakeTitle},
           'manual', ${proteinG}, 0, 0, ${kcal})
      `;

      await recordAudit(tx, actor, {
        action: "project100.nutrition.meal.log",
        targetType: "project100_meal",
        targetId: mealId,
        metadata: { quickLog: true, shake: true },
      });

      proteinAddedG = proteinG;
    }

    // -------------------------------------------------------------
    // 4. Bygg Slutkvitto
    // -------------------------------------------------------------
    const receiptParts: string[] = [];

    const durationText = input.workout.durationMinutes
      ? ` (${input.workout.durationMinutes} min)`
      : "";
    receiptParts.push(`Pass sparat · ${sessionTitle}${durationText}`);

    if (loggedEnergy !== null) {
      receiptParts.push(`Energi ${loggedEnergy} loggad`);
    } else if (journalUpdated) {
      receiptParts.push("Dagsform uppdaterad");
    }

    if (proteinAddedG !== null) {
      receiptParts.push(`${proteinAddedG} g protein tillagt`);
    }

    const receipt = receiptParts.join(" · ");

    return {
      success: true,
      sessionId,
      sessionTitle,
      workoutMode,
      journalUpdated,
      proteinAddedG,
      receipt,
    };
  });
}

import "server-only";

import { addCalendarDateDays, calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import {
  project100MetricLabel,
  type Project100BodyEntry,
  type Project100BodyGoal,
  type Project100BodyJourney,
  type Project100MeasurementUnit,
  type Project100WeightPoint,
} from "@/lib/project100-body";
import { recordAudit } from "@/server/audit";
import type { ActorContext } from "@/server/authorization-types";
import { readyClient } from "@/server/database";
import { AppError } from "@/server/errors";
import { assertProject100Adult } from "@/server/project100";
import type {
  Project100BodyEntryInput,
  Project100BodyPeriod,
  Project100SettingsInput,
} from "@/server/project100-body-schemas";

const DEFAULT_PERIOD_DAYS = 180;
const WEIGHT_HISTORY_LIMIT = 2_000;

interface EntryRow {
  measured_on: string;
  note: string | null;
}

interface MeasurementRow {
  measured_on: string;
  metric: string;
  label: string | null;
  unit: Project100MeasurementUnit;
  value: number | string;
}

interface SettingsRow {
  weight_goal_kg: number | string | null;
  start_weight_kg: number | string | null;
  height_cm: number | string | null;
}

function asNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function day(value: string): string {
  return value.slice(0, 10);
}

export async function loadProject100BodyJourney(
  actor: ActorContext,
  period: Project100BodyPeriod = { from: null, to: null },
): Promise<Project100BodyJourney> {
  assertProject100Adult(actor);
  const today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  const to = period.to ?? today;
  const from = period.from ?? addCalendarDateDays(to, -DEFAULT_PERIOD_DAYS);

  const sql = await readyClient();
  const [entryRows, measurementRows, settingsRows, historyRows] = await Promise.all([
    sql<EntryRow[]>`
      select to_char(measured_on, 'YYYY-MM-DD') as measured_on, note
      from project100_body_entries
      where user_id = ${actor.userId}
        and measured_on >= ${from}
        and measured_on <= ${to}
      order by measured_on desc
    `,
    sql<MeasurementRow[]>`
      select to_char(measured_on, 'YYYY-MM-DD') as measured_on, metric, label, unit, value
      from project100_body_measurements
      where user_id = ${actor.userId}
        and measured_on >= ${from}
        and measured_on <= ${to}
      order by measured_on desc, metric
    `,
    sql<SettingsRow[]>`
      select weight_goal_kg, start_weight_kg, height_cm
      from project100_settings
      where user_id = ${actor.userId}
      limit 1
    `,
    // Milestones are about the whole road, so the weight line is never cut by
    // the period the user happens to be looking at.
    sql<{ measured_on: string; value: number | string }[]>`
      select to_char(measured_on, 'YYYY-MM-DD') as measured_on, value
      from project100_body_measurements
      where user_id = ${actor.userId} and metric = 'weight'
      order by measured_on asc
      limit ${WEIGHT_HISTORY_LIMIT}
    `,
  ]);

  const byDay = new Map<string, Project100BodyEntry>();
  for (const row of entryRows) {
    byDay.set(day(row.measured_on), {
      measuredOn: day(row.measured_on),
      note: row.note,
      measurements: [],
    });
  }
  for (const row of measurementRows) {
    const entry = byDay.get(day(row.measured_on));
    if (!entry) continue;
    const value = asNumber(row.value);
    if (value === null) continue;
    entry.measurements.push({
      metric: row.metric,
      label: project100MetricLabel(row.metric, row.label),
      unit: row.unit,
      value,
    });
  }

  const settings = settingsRows[0];
  const weightHistory: Project100WeightPoint[] = historyRows.flatMap((row) => {
    const value = asNumber(row.value);
    return value === null ? [] : [{ measuredOn: day(row.measured_on), value }];
  });
  const goal: Project100BodyGoal = {
    weightGoalKg: asNumber(settings?.weight_goal_kg ?? null),
    startWeightKg: asNumber(settings?.start_weight_kg ?? null) ?? weightHistory[0]?.value ?? null,
    heightCm: asNumber(settings?.height_cm ?? null),
  };

  return { today, from, to, entries: [...byDay.values()], goal, weightHistory };
}

/**
 * Writes one measured day. The day is replaced as a whole: what the form shows
 * is what the day holds afterwards, so removing a measurement is done by not
 * sending it rather than by a second request that could half-fail.
 */
export async function saveProject100BodyEntry(
  actor: ActorContext,
  input: Project100BodyEntryInput,
): Promise<Project100BodyEntry> {
  assertProject100Adult(actor);
  const today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  if (input.measuredOn > today) {
    throw new AppError(
      400,
      "PROJECT100_FUTURE_MEASUREMENT",
      "Ett mått kan inte tas i framtiden.",
    );
  }

  const sql = await readyClient();
  await sql.begin(async (tx) => {
    await tx`
      insert into project100_body_entries (user_id, measured_on, note)
      values (${actor.userId}, ${input.measuredOn}, ${input.note})
      on conflict (user_id, measured_on) do update
        set note = excluded.note, updated_at = now()
    `;
    await tx`
      delete from project100_body_measurements
      where user_id = ${actor.userId} and measured_on = ${input.measuredOn}
    `;
    for (const measurement of input.measurements) {
      await tx`
        insert into project100_body_measurements
          (id, user_id, measured_on, metric, label, unit, value)
        values
          (${crypto.randomUUID()}, ${actor.userId}, ${input.measuredOn},
           ${measurement.metric}, ${measurement.label}, ${measurement.unit},
           ${measurement.value})
      `;
    }
    await recordAudit(tx, actor, {
      action: "project100.body.save",
      targetType: "project100_body_entry",
      targetId: input.measuredOn,
      metadata: { measurements: input.measurements.length },
    });
  });

  const journey = await loadProject100BodyJourney(actor, {
    from: input.measuredOn,
    to: input.measuredOn,
  });
  const saved = journey.entries[0];
  if (!saved) {
    throw new AppError(500, "PROJECT100_BODY_NOT_READABLE", "Mätningen kunde inte läsas tillbaka.");
  }
  return saved;
}

export async function deleteProject100BodyEntry(
  actor: ActorContext,
  measuredOn: string,
): Promise<boolean> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  return sql.begin(async (tx) => {
    const rows = await tx<{ measured_on: string }[]>`
      delete from project100_body_entries
      where user_id = ${actor.userId} and measured_on = ${measuredOn}
      returning to_char(measured_on, 'YYYY-MM-DD') as measured_on
    `;
    if (!rows[0]) return false;
    await recordAudit(tx, actor, {
      action: "project100.body.delete",
      targetType: "project100_body_entry",
      targetId: measuredOn,
    });
    return true;
  });
}

export async function saveProject100Settings(
  actor: ActorContext,
  input: Project100SettingsInput,
): Promise<Project100BodyGoal> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const rows = await sql<SettingsRow[]>`
    insert into project100_settings
      (user_id, weight_goal_kg, start_weight_kg, height_cm)
    values
      (${actor.userId}, ${input.weightGoalKg}, ${input.startWeightKg}, ${input.heightCm})
    on conflict (user_id) do update
      set weight_goal_kg = excluded.weight_goal_kg,
          start_weight_kg = excluded.start_weight_kg,
          height_cm = excluded.height_cm,
          updated_at = now()
    returning weight_goal_kg, start_weight_kg, height_cm
  `;
  return {
    weightGoalKg: asNumber(rows[0]?.weight_goal_kg ?? null),
    startWeightKg: asNumber(rows[0]?.start_weight_kg ?? null),
    heightCm: asNumber(rows[0]?.height_cm ?? null),
  };
}

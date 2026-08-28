import "server-only";

import type { SoloProgressView } from "@/components/solo-contracts";
import { DEFAULT_TIME_ZONE, calendarDateInTimeZone } from "@/lib/dates";
import {
  SOLO_ZERO_XP_ACTIVITIES,
  buildSoloSummary,
  soloActionRule,
  type SoloAction,
  type SoloActionKind,
  type SoloHealthDay,
  type SoloSettings,
} from "@/lib/solo";
import { buildSoloQuests, buildSoloTalents } from "@/lib/solo-talents";
import { recordAudit } from "@/server/audit";
import type { ActorContext } from "@/server/authorization-types";
import { readyClient } from "@/server/database";
import { AppError } from "@/server/errors";
import type {
  SoloActionInput,
  SoloHealthInput,
  SoloSettingsInput,
} from "@/server/schemas";

/**
 * Solo progress belongs to one account and to no household. Every statement in
 * this module filters on `actor.userId`, and none of them mention a household
 * id at all, so there is no filter here that could be forgotten in a way that
 * shows one adult's weight or income to the rest of the family.
 */

/** A personal ledger stays small; the cap only stops an unbounded read. */
const MAX_ROWS = 5_000;

/** How many recent entries the log view shows. */
const RECENT_ACTIONS = 20;

interface SoloActionRow {
  id: string;
  kind: SoloActionKind;
  occurred_on: string;
  evidence: string;
  amount_ore: string | null;
  xp: number;
  created_at: Date | string;
}

interface SoloHealthRow {
  day: string;
  sleep_hours: string | null;
  workouts: number;
  weight_kg: string | null;
  energy: number | null;
  diet_held: boolean | null;
  mobility: boolean | null;
  note: string | null;
}

interface SoloSettingsRow {
  weight_goal_kg: string | null;
}

/** `numeric` and `bigint` arrive as strings, so every one is converted once. */
function asNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapAction(row: SoloActionRow): SoloAction {
  return {
    id: row.id,
    kind: row.kind,
    occurredOn: row.occurred_on,
    evidence: row.evidence,
    amountOre: asNumber(row.amount_ore),
    xp: row.xp,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapHealthDay(row: SoloHealthRow): SoloHealthDay {
  return {
    date: row.day,
    sleepHours: asNumber(row.sleep_hours),
    workouts: row.workouts,
    weightKg: asNumber(row.weight_kg),
    energy: row.energy,
    dietHeld: row.diet_held,
    mobility: row.mobility,
    note: row.note,
  };
}

/**
 * The household timezone is Swedish for this family and stays the assumption
 * here. Solo rows have no household of their own to read a timezone from, and
 * a wrong guess would only ever misfile an entry logged around midnight.
 */
export function soloToday(): string {
  return calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
}

/** One shape, defined next to the view that renders it. */
export type SoloProgress = SoloProgressView;

async function loadRows(userId: string): Promise<{
  actions: SoloAction[];
  healthDays: SoloHealthDay[];
  settings: SoloSettings;
}> {
  const sql = await readyClient();
  const [actionRows, healthRows, settingsRows] = await Promise.all([
    sql<SoloActionRow[]>`
      select id, kind, to_char(occurred_on, 'YYYY-MM-DD') as occurred_on,
             evidence, amount_ore, xp, created_at
      from solo_actions
      where user_id = ${userId}
      order by occurred_on desc, created_at desc
      limit ${MAX_ROWS}
    `,
    sql<SoloHealthRow[]>`
      select to_char(day, 'YYYY-MM-DD') as day, sleep_hours, workouts,
             weight_kg, energy, diet_held, mobility, note
      from solo_health_days
      where user_id = ${userId}
      order by day desc
      limit ${MAX_ROWS}
    `,
    sql<SoloSettingsRow[]>`
      select weight_goal_kg from solo_settings where user_id = ${userId} limit 1
    `,
  ]);

  return {
    actions: actionRows.map(mapAction),
    healthDays: healthRows.map(mapHealthDay),
    settings: {
      weightGoalKg: asNumber(settingsRows[0]?.weight_goal_kg ?? null),
    },
  };
}

export async function loadSoloProgress(
  actor: ActorContext,
): Promise<SoloProgress> {
  const today = soloToday();
  const { actions, healthDays, settings } = await loadRows(actor.userId);
  const summary = buildSoloSummary({ actions, healthDays, today });
  const talents = buildSoloTalents({
    actions,
    healthDays,
    settings,
    summary,
    today,
  });

  return {
    today,
    summary,
    talents,
    settings,
    quests: buildSoloQuests(talents, summary),
    recentActions: actions.slice(0, RECENT_ACTIONS),
    healthToday: healthDays.find((day) => day.date === today) ?? null,
    zeroXpActivities: SOLO_ZERO_XP_ACTIVITIES,
  };
}

function assertNotInTheFuture(date: string, today: string): void {
  if (date > today) {
    throw new AppError(
      400,
      "SOLO_FUTURE_ENTRY",
      "Du kan inte logga något som inte hänt än.",
    );
  }
}

/**
 * Experience comes from the rule table, never from the request. A client that
 * asks for four hundred points for a sent email gets the thirty the kind is
 * worth, because the one thing this ledger has to be is unbribable.
 */
export async function logSoloAction(
  actor: ActorContext,
  input: SoloActionInput,
): Promise<SoloAction> {
  const today = soloToday();
  assertNotInTheFuture(input.occurredOn, today);

  const rule = soloActionRule(input.kind);
  const action: SoloAction = {
    id: crypto.randomUUID(),
    kind: input.kind,
    occurredOn: input.occurredOn,
    evidence: input.evidence,
    amountOre: rule.amount === "none" ? null : input.amountOre,
    xp: rule.xp,
    createdAt: new Date().toISOString(),
  };

  const sql = await readyClient();
  await sql.begin(async (tx) => {
    await tx`
      insert into solo_actions
        (id, user_id, kind, occurred_on, evidence, amount_ore, xp)
      values
        (${action.id}, ${actor.userId}, ${action.kind}, ${action.occurredOn},
         ${action.evidence}, ${action.amountOre}, ${action.xp})
    `;
    // The shared audit log records that a private entry happened and nothing
    // about what it said. No evidence, no amount, not even the kind.
    await recordAudit(tx, actor, {
      action: "solo.action.create",
      targetType: "solo_action",
      targetId: action.id,
      metadata: { track: rule.track },
    });
  });

  return action;
}

/**
 * A wrongly logged entry has to be removable. A ledger that cannot be corrected
 * stops being trusted, and an untrusted scoreboard is abandoned.
 */
export async function removeSoloAction(
  actor: ActorContext,
  id: string,
): Promise<boolean> {
  const sql = await readyClient();
  return await sql.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      delete from solo_actions
      where id = ${id} and user_id = ${actor.userId}
      returning id
    `;
    if (!rows[0]) return false;
    await recordAudit(tx, actor, {
      action: "solo.action.delete",
      targetType: "solo_action",
      targetId: id,
    });
    return true;
  });
}

export async function saveSoloHealthDay(
  actor: ActorContext,
  input: SoloHealthInput,
): Promise<SoloHealthDay> {
  const today = soloToday();
  assertNotInTheFuture(input.date, today);

  const sql = await readyClient();
  const saved = await sql.begin(async (tx) => {
    const rows = await tx<SoloHealthRow[]>`
      insert into solo_health_days
        (user_id, day, sleep_hours, workouts, weight_kg, energy, diet_held,
         mobility, note)
      values
        (${actor.userId}, ${input.date}, ${input.sleepHours}, ${input.workouts},
         ${input.weightKg}, ${input.energy}, ${input.dietHeld},
         ${input.mobility}, ${input.note})
      on conflict (user_id, day) do update set
        sleep_hours = excluded.sleep_hours,
        workouts = excluded.workouts,
        weight_kg = excluded.weight_kg,
        energy = excluded.energy,
        diet_held = excluded.diet_held,
        mobility = excluded.mobility,
        note = excluded.note,
        updated_at = now()
      returning to_char(day, 'YYYY-MM-DD') as day, sleep_hours, workouts,
                weight_kg, energy, diet_held, mobility, note
    `;
    await recordAudit(tx, actor, {
      action: "solo.health.save",
      targetType: "solo_health_day",
      targetId: null,
    });
    return rows[0];
  });

  return mapHealthDay(saved);
}

/**
 * The weight goal is the only number here that describes a body rather than a
 * day, so it is stored on its own and never derived from the log.
 */
export async function saveSoloSettings(
  actor: ActorContext,
  input: SoloSettingsInput,
): Promise<SoloSettings> {
  const sql = await readyClient();
  const rows = await sql<SoloSettingsRow[]>`
    insert into solo_settings (user_id, weight_goal_kg)
    values (${actor.userId}, ${input.weightGoalKg})
    on conflict (user_id) do update set
      weight_goal_kg = excluded.weight_goal_kg,
      updated_at = now()
    returning weight_goal_kg
  `;
  return { weightGoalKg: asNumber(rows[0]?.weight_goal_kg ?? null) };
}

import "server-only";

import type postgres from "postgres";

import type { ActorContext } from "@/server/authorization-types";

type AuditClient = postgres.Sql | postgres.TransactionSql;

export type AuditAction =
  | "event.create"
  | "event.update"
  | "event.delete"
  | "task.create"
  | "task.update"
  | "task.delete"
  | "document.confirm"
  | "document.organize"
  | "document.delete"
  | "folder.create"
  | "folder.update"
  | "folder.delete"
  | "person.create"
  | "person.update"
  | "person.delete"
  | "household.update"
  | "telegram.link"
  | "telegram.unlink"
  | "membership.create"
  | "membership.update"
  | "solo.action.create"
  | "solo.action.delete"
  | "solo.health.save"
  | "project100.training.session.create"
  | "project100.training.session.update"
  | "project100.training.session.delete"
  | "project100.training.template.create"
  | "project100.training.template.delete"
  | "project100.training.exercise.muscles.update"
  | "project100.nutrition.batch.create"
  | "project100.nutrition.meal.log"
  | "project100.nutrition.meal.delete"
  | "project100.nutrition.recipe.create"
  | "project100.nutrition.recipe.update"
  | "project100.nutrition.recipe.delete"
  | "project100.nutrition.plan.create"
  | "project100.nutrition.plan.delete"
  | "project100.nutrition.pantry.update"
  | "project100.nutrition.target.update"
  | "project100.journal.save"
  | "project100.journal.delete"
  | "project100.body.save"
  | "project100.body.delete"
  | "project100.media.create"
  | "project100.media.delete"
  | "login.create";

/**
 * Audit metadata describes the shape of a change, never its content. Titles,
 * notes, names and document text belong in the household's own tables, which
 * have retention and deletion rules the append-only log deliberately lacks.
 */
export type AuditMetadata = Record<string, string | number | boolean | null>;

export interface AuditEntry {
  action: AuditAction;
  targetType: string;
  targetId: string | null;
  metadata?: AuditMetadata;
}

function actorKind(actor: ActorContext): "user" | "telegram" | "system" {
  if (actor.channel === "telegram") return "telegram";
  if (actor.channel === "system") return "system";
  return "user";
}

/**
 * Writes one audit row. Metadata is handed to the driver as a value rather than
 * as a JSON string: `JSON.stringify(...)::jsonb` stores a jsonb *string*, so
 * `metadata->>'field'` finds nothing and the log is only readable by eye.
 * Always call this with the same transaction as the
 * change it describes: a log that can survive a rolled-back write, or be lost
 * while the write succeeds, is worse than no log because it is trusted.
 *
 * The table refuses updates and deletes at the database level, so a wrong entry
 * is corrected by appending a later one, never by editing history.
 */
export async function recordAudit(
  sql: AuditClient,
  actor: ActorContext,
  entry: AuditEntry,
): Promise<void> {
  await sql`
    insert into family_audit_log
      (household_id, actor_kind, actor_id, action, target_type, target_id, metadata)
    values (
      ${actor.householdId},
      ${actorKind(actor)},
      ${actor.userId},
      ${entry.action},
      ${entry.targetType},
      ${entry.targetId},
      ${sql.json(entry.metadata ?? {})}
    )
  `;
}

import "server-only";

import type postgres from "postgres";

import type { FamilyEvent, FamilyTask } from "@/lib/types";
import type { ActorContext } from "@/server/authorization-types";

type UndoClient = postgres.Sql | postgres.TransactionSql;

/**
 * A way back from a deletion.
 *
 * The removed row is copied here inside the same transaction that removes it, so
 * an entry can never describe a deletion that did not happen, nor be missing for
 * one that did.
 *
 * Deletions stay hard on purpose. Marking rows as deleted instead would put a
 * condition into every read in the product, and the read that got forgotten
 * would quietly serve the family data they had just removed.
 */

/** Long enough to notice a mistake, short enough not to become a second archive. */
export const UNDO_RETENTION_DAYS = 30;

export type UndoAction = "event.delete" | "task.delete";

export interface UndoEntry {
  id: string;
  action: UndoAction;
  label: string;
  createdAt: string;
}

interface UndoPayload {
  event?: FamilyEvent;
  task?: FamilyTask;
}

/**
 * The payload is round-tripped through JSON so the driver receives plain values.
 * Everything stored here is already plain: the rows are what the API returns.
 */
export async function captureUndo(
  sql: UndoClient,
  actor: ActorContext,
  entry: { action: UndoAction; label: string; payload: UndoPayload },
): Promise<void> {
  // Expired entries are cleared on the way past rather than by a scheduler the
  // product does not have yet.
  await sql`
    delete from family_undo_entries
    where household_id = ${actor.householdId} and expires_at <= now()
  `;
  await sql`
    insert into family_undo_entries
      (household_id, actor_id, action, label, payload, expires_at)
    values (
      ${actor.householdId}, ${actor.userId}, ${entry.action}, ${entry.label},
      ${sql.json(JSON.parse(JSON.stringify(entry.payload)))},
      now() + ${`${UNDO_RETENTION_DAYS} days`}::interval
    )
  `;
}

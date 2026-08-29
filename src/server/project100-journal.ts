import "server-only";

import { addCalendarDateDays, calendarDateInTimeZone, DEFAULT_TIME_ZONE } from "@/lib/dates";
import type {
  Project100JournalEntry,
  Project100JournalView,
} from "@/lib/project100-journal";
import { recordAudit } from "@/server/audit";
import type { ActorContext } from "@/server/authorization-types";
import { readyClient } from "@/server/database";
import { AppError } from "@/server/errors";
import { assertProject100Adult } from "@/server/project100";
import type {
  Project100JournalEntryInput,
  Project100JournalFilter,
} from "@/server/project100-journal-schemas";

const DEFAULT_PERIOD_DAYS = 365;
const ENTRY_LIMIT = 120;

interface JournalRow {
  written_on: string;
  body: string | null;
  mood: number | null;
  energy: number | null;
  sleep_hours: number | string | null;
  excluded_from_ai: boolean;
  updated_at: Date | string;
}

function asNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function entry(row: JournalRow): Project100JournalEntry {
  return {
    writtenOn: row.written_on.slice(0, 10),
    body: row.body,
    mood: row.mood,
    energy: row.energy,
    sleepHours: asNumber(row.sleep_hours),
    excludedFromAi: row.excluded_from_ai,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString(),
  };
}

export async function loadProject100Journal(
  actor: ActorContext,
  filter: Project100JournalFilter = { from: null, to: null, query: null },
): Promise<Project100JournalView> {
  assertProject100Adult(actor);
  const today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  const to = filter.to ?? today;
  const from = filter.from ?? addCalendarDateDays(to, -DEFAULT_PERIOD_DAYS);

  const sql = await readyClient();
  const [rows, totals] = await Promise.all([
    sql<JournalRow[]>`
      select to_char(written_on, 'YYYY-MM-DD') as written_on, body, mood, energy,
             sleep_hours, excluded_from_ai, updated_at
      from project100_journal_entries
      where user_id = ${actor.userId}
        and written_on >= ${from}
        and written_on <= ${to}
        and (
          ${filter.query}::text is null
          or to_tsvector('swedish', coalesce(body, ''))
             @@ plainto_tsquery('swedish', ${filter.query})
        )
      order by written_on desc
      limit ${ENTRY_LIMIT}
    `,
    sql<{ total: number | string; excluded: number | string }[]>`
      select count(*)::int as total,
             count(*) filter (where excluded_from_ai)::int as excluded
      from project100_journal_entries
      where user_id = ${actor.userId}
    `,
  ]);

  return {
    today,
    from,
    to,
    query: filter.query,
    entries: rows.map(entry),
    totalEntries: asNumber(totals[0]?.total ?? null) ?? 0,
    excludedCount: asNumber(totals[0]?.excluded ?? null) ?? 0,
  };
}

/**
 * Writes one day. A diary is edited far more often than it is created, so the
 * day is upserted rather than versioned — the last thing the user wrote about a
 * day is what that day says.
 */
export async function saveProject100JournalEntry(
  actor: ActorContext,
  input: Project100JournalEntryInput,
): Promise<Project100JournalEntry> {
  assertProject100Adult(actor);
  const today = calendarDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
  if (input.writtenOn > today) {
    throw new AppError(
      400,
      "PROJECT100_FUTURE_JOURNAL",
      "Du kan inte skriva dagbok om en dag som inte varit.",
    );
  }

  const sql = await readyClient();
  const rows = await sql.begin(async (tx) => {
    const written = await tx<JournalRow[]>`
      insert into project100_journal_entries
        (user_id, written_on, body, mood, energy, sleep_hours, excluded_from_ai)
      values
        (${actor.userId}, ${input.writtenOn}, ${input.body}, ${input.mood},
         ${input.energy}, ${input.sleepHours}, ${input.excludedFromAi})
      on conflict (user_id, written_on) do update
        set body = excluded.body,
            mood = excluded.mood,
            energy = excluded.energy,
            sleep_hours = excluded.sleep_hours,
            excluded_from_ai = excluded.excluded_from_ai,
            updated_at = now()
      returning to_char(written_on, 'YYYY-MM-DD') as written_on, body, mood,
                energy, sleep_hours, excluded_from_ai, updated_at
    `;
    // The audit says a day was written, never a word of what it said.
    await recordAudit(tx, actor, {
      action: "project100.journal.save",
      targetType: "project100_journal_entry",
      targetId: input.writtenOn,
      metadata: { excludedFromAi: input.excludedFromAi },
    });
    return written;
  });

  if (!rows[0]) {
    throw new AppError(500, "PROJECT100_JOURNAL_NOT_SAVED", "Anteckningen kunde inte sparas.");
  }
  return entry(rows[0]);
}

export async function deleteProject100JournalEntry(
  actor: ActorContext,
  writtenOn: string,
): Promise<boolean> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  return sql.begin(async (tx) => {
    const rows = await tx<{ written_on: string }[]>`
      delete from project100_journal_entries
      where user_id = ${actor.userId} and written_on = ${writtenOn}
      returning to_char(written_on, 'YYYY-MM-DD') as written_on
    `;
    if (!rows[0]) return false;
    await recordAudit(tx, actor, {
      action: "project100.journal.delete",
      targetType: "project100_journal_entry",
      targetId: writtenOn,
    });
    return true;
  });
}

/**
 * What the assistant is allowed to read. Kept here, next to the writing, so a
 * future Jarvis cannot reach the diary through a path that forgot the flag.
 */
export async function loadProject100JournalForAssistant(
  actor: ActorContext,
  from: string,
  to: string,
): Promise<Project100JournalEntry[]> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const rows = await sql<JournalRow[]>`
    select to_char(written_on, 'YYYY-MM-DD') as written_on, body, mood, energy,
           sleep_hours, excluded_from_ai, updated_at
    from project100_journal_entries
    where user_id = ${actor.userId}
      and written_on >= ${from}
      and written_on <= ${to}
      and excluded_from_ai = false
    order by written_on desc
    limit ${ENTRY_LIMIT}
  `;
  return rows.map(entry);
}

import { recordAudit } from "@/server/audit";
import type { ActorContext } from "@/server/authorization-types";
import { readyClient } from "@/server/database";
import { AppError } from "@/server/errors";
import { validateWishlistQuery } from "@/server/jarvis-gaps-guard";
import { assertProject100Adult } from "@/server/project100";

export type JarvisCapabilityGapStatus = "pending" | "implemented" | "dismissed";

export interface JarvisCapabilityGap {
  id: string;
  userId: string;
  rawQuery: string;
  detectedIntent: string | null;
  categoryHint: string | null;
  channel: "telegram" | "web";
  status: JarvisCapabilityGapStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GapRow {
  id: string;
  user_id: string;
  raw_query: string;
  detected_intent: string | null;
  category_hint: string | null;
  channel: string;
  status: JarvisCapabilityGapStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapGap(row: GapRow): JarvisCapabilityGap {
  return {
    id: row.id,
    userId: row.user_id,
    rawQuery: row.raw_query,
    detectedIntent: row.detected_intent,
    categoryHint: row.category_hint,
    channel: row.channel === "telegram" ? "telegram" : "web",
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function logJarvisCapabilityGap(
  actor: ActorContext,
  rawQuery: string,
  channel: "telegram" | "web" = "web",
  options: {
    detectedIntent?: string;
    categoryHint?: string;
    notes?: string;
  } = {},
): Promise<JarvisCapabilityGap | null> {
  assertProject100Adult(actor);

  const validation = validateWishlistQuery(rawQuery);
  if (!validation.allowed) {
    // Block weird / malicious / gibberish inputs from polluting the wishlist
    return null;
  }

  const sql = await readyClient();
  const id = crypto.randomUUID();
  const sanitizedQuery = validation.sanitizedQuery;
  const effectiveCategory = options.categoryHint || validation.categoryHint || null;

  // Deduplication check: Avoid multiple pending duplicates
  const existing = await sql<GapRow[]>`
    select id, user_id, raw_query, detected_intent, category_hint,
           channel, status, notes,
           to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
           to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
    from jarvis_capability_gaps
    where user_id = ${actor.userId}
      and status = 'pending'
      and lower(raw_query) = lower(${sanitizedQuery})
    limit 1
  `;

  if (existing.length > 0) {
    return mapGap(existing[0]);
  }

  const rows = await sql<GapRow[]>`
    insert into jarvis_capability_gaps (
      id, user_id, raw_query, detected_intent, category_hint,
      channel, status, notes
    ) values (
      ${id}, ${actor.userId}, ${sanitizedQuery},
      ${options.detectedIntent?.slice(0, 120) || null},
      ${effectiveCategory?.slice(0, 60) || null},
      ${channel}, 'pending',
      ${options.notes?.slice(0, 2000) || null}
    )
    returning id, user_id, raw_query, detected_intent, category_hint,
              channel, status, notes,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
              to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
  `;

  await recordAudit(sql, actor, {
    action: "jarvis.gap.logged",
    targetType: "jarvis_capability_gap",
    targetId: id,
    metadata: {
      channel,
      categoryHint: effectiveCategory,
    },
  });

  return mapGap(rows[0]);
}

export async function listJarvisCapabilityGaps(
  actor: ActorContext,
  status?: JarvisCapabilityGapStatus,
): Promise<JarvisCapabilityGap[]> {
  assertProject100Adult(actor);
  const sql = await readyClient();

  const rows = status
    ? await sql<GapRow[]>`
        select id, user_id, raw_query, detected_intent, category_hint,
               channel, status, notes,
               to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
               to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
        from jarvis_capability_gaps
        where user_id = ${actor.userId}
          and status = ${status}
        order by created_at desc
        limit 100
      `
    : await sql<GapRow[]>`
        select id, user_id, raw_query, detected_intent, category_hint,
               channel, status, notes,
               to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
               to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
        from jarvis_capability_gaps
        where user_id = ${actor.userId}
        order by created_at desc
        limit 100
      `;

  return rows.map(mapGap);
}

export async function updateJarvisCapabilityGapStatus(
  actor: ActorContext,
  id: string,
  status: JarvisCapabilityGapStatus,
): Promise<JarvisCapabilityGap> {
  assertProject100Adult(actor);
  const sql = await readyClient();

  const rows = await sql<GapRow[]>`
    update jarvis_capability_gaps
    set status = ${status},
        updated_at = now()
    where id = ${id} and user_id = ${actor.userId}
    returning id, user_id, raw_query, detected_intent, category_hint,
              channel, status, notes,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
              to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
  `;

  if (rows.length === 0) {
    throw new AppError(404, "GAP_NOT_FOUND", "Önskemålet hittades inte.");
  }

  await recordAudit(sql, actor, {
    action: "jarvis.gap.update",
    targetType: "jarvis_capability_gap",
    targetId: id,
    metadata: { status },
  });

  return mapGap(rows[0]);
}

export async function deleteJarvisCapabilityGap(
  actor: ActorContext,
  id: string,
): Promise<boolean> {
  assertProject100Adult(actor);
  const sql = await readyClient();

  const rows = await sql<{ id: string }[]>`
    delete from jarvis_capability_gaps
    where id = ${id} and user_id = ${actor.userId}
    returning id
  `;

  if (rows.length === 0) {
    return false;
  }

  await recordAudit(sql, actor, {
    action: "jarvis.gap.deleted",
    targetType: "jarvis_capability_gap",
    targetId: id,
    metadata: {},
  });

  return true;
}

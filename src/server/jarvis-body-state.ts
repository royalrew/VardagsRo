import "server-only";

import type { JarvisBodyPart } from "@/lib/jarvis-natural-language";
import { jarvisBodyPartLabel } from "@/lib/jarvis-natural-language";
import { recordAudit } from "@/server/audit";
import type { ActorContext } from "@/server/authorization-types";
import { readyClient } from "@/server/database";
import { assertProject100Adult } from "@/server/project100";

export interface JarvisBodyLimitation {
  id: string;
  bodyPart: JarvisBodyPart;
  bodyPartLabel: string;
  content: string;
  reportedOn: string;
}

interface LimitationRow {
  id: string;
  content: string;
  source_ref: string;
  created_on: string;
}

const SOURCE_PREFIX = "jarvis:";
const SOURCE_MARKER = ":body-limitation:";

function sourceRef(source: "telegram" | "web", bodyPart: JarvisBodyPart): string {
  return `${SOURCE_PREFIX}${source}${SOURCE_MARKER}${bodyPart}`;
}

function sourcePattern(bodyPart: JarvisBodyPart): string {
  return `${SOURCE_PREFIX}%${SOURCE_MARKER}${bodyPart}`;
}

function bodyPartFromSource(value: string): JarvisBodyPart | null {
  const candidate = value.split(SOURCE_MARKER)[1];
  return candidate === "foot" ||
    candidate === "wrist" ||
    candidate === "hand" ||
    candidate === "knee" ||
    candidate === "shoulder" ||
    candidate === "elbow" ||
    candidate === "back" ||
    candidate === "neck" ||
    candidate === "hip" ||
    candidate === "calf"
    ? candidate
    : null;
}

function mapLimitation(row: LimitationRow): JarvisBodyLimitation | null {
  const bodyPart = bodyPartFromSource(row.source_ref);
  if (!bodyPart) return null;
  return {
    id: row.id,
    bodyPart,
    bodyPartLabel: jarvisBodyPartLabel(bodyPart),
    content: row.content,
    reportedOn: row.created_on,
  };
}

export async function saveJarvisBodyLimitation(
  actor: ActorContext,
  bodyPart: JarvisBodyPart,
  reportedOn: string,
  source: "telegram" | "web",
): Promise<JarvisBodyLimitation> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const label = jarvisBodyPartLabel(bodyPart);
  const content = `Ont i ${label}, rapporterat ${reportedOn}. Anpassa träningsförslag för att undvika onödig belastning.`;

  return sql.begin(async (tx) => {
    const existing = await tx<LimitationRow[]>`
      select id, content, source_ref,
             to_char(created_at, 'YYYY-MM-DD') as created_on
      from project100_memories
      where user_id = ${actor.userId}
        and category = 'injury'
        and is_active = true
        and source_ref like ${sourcePattern(bodyPart)}
      order by updated_at desc
      limit 1
      for update
    `;

    let row: LimitationRow;
    let action: "project100.jarvis.memory.create" | "project100.jarvis.memory.update";
    if (existing[0]) {
      const rows = await tx<LimitationRow[]>`
        update project100_memories
        set content = ${content}, source_ref = ${sourceRef(source, bodyPart)}, updated_at = now()
        where id = ${existing[0].id} and user_id = ${actor.userId}
        returning id, content, source_ref,
                  to_char(created_at, 'YYYY-MM-DD') as created_on
      `;
      row = rows[0];
      action = "project100.jarvis.memory.update";
    } else {
      const id = crypto.randomUUID();
      const rows = await tx<LimitationRow[]>`
        insert into project100_memories
          (id, user_id, kind, category, content, source_ref, is_active)
        values
          (${id}, ${actor.userId}, 'event', 'injury', ${content},
           ${sourceRef(source, bodyPart)}, true)
        returning id, content, source_ref,
                  to_char(created_at, 'YYYY-MM-DD') as created_on
      `;
      row = rows[0];
      action = "project100.jarvis.memory.create";
    }

    await recordAudit(tx, actor, {
      action,
      targetType: "project100_memory",
      targetId: row.id,
      metadata: { category: "injury", bodyPart, source },
    });

    return mapLimitation(row)!;
  });
}

export async function resolveJarvisBodyLimitation(
  actor: ActorContext,
  bodyPart: JarvisBodyPart,
): Promise<number> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  return sql.begin(async (tx) => {
    const rows = await tx<Array<{ id: string }>>`
      update project100_memories
      set is_active = false, updated_at = now()
      where user_id = ${actor.userId}
        and category = 'injury'
        and is_active = true
        and source_ref like ${sourcePattern(bodyPart)}
      returning id
    `;

    for (const row of rows) {
      await recordAudit(tx, actor, {
        action: "project100.jarvis.memory.update",
        targetType: "project100_memory",
        targetId: row.id,
        metadata: { category: "injury", bodyPart, isActive: false },
      });
    }
    return rows.length;
  });
}

export async function listJarvisBodyLimitations(
  actor: ActorContext,
): Promise<JarvisBodyLimitation[]> {
  assertProject100Adult(actor);
  const sql = await readyClient();
  const rows = await sql<LimitationRow[]>`
    select id, content, source_ref,
           to_char(created_at, 'YYYY-MM-DD') as created_on
    from project100_memories
    where user_id = ${actor.userId}
      and category = 'injury'
      and is_active = true
      and source_ref like 'jarvis:%:body-limitation:%'
    order by updated_at desc
  `;
  return rows.map(mapLimitation).filter((item): item is JarvisBodyLimitation => item !== null);
}

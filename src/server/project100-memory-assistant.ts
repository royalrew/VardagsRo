import {
  MEMORY_CATEGORY_LABELS,
  type Project100MemoryCategory,
  type Project100MemoryKind,
} from "@/lib/project100-jarvis";
import { parseMemoryCommand } from "@/lib/project100-memory-classifier";
import { recordAudit } from "@/server/audit";
import type { ActorContext } from "@/server/authorization-types";
import { readyClient } from "@/server/database";
import { assertProject100Adult } from "@/server/project100";

interface MemoryRow {
  id: string;
  kind: Project100MemoryKind;
  category: Project100MemoryCategory;
  content: string;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryAssistantResult {
  handled: boolean;
  replyText: string;
  isStore?: boolean;
  memoryId?: string;
  category?: Project100MemoryCategory;
}

export async function handleMemoryTextIntent(
  actor: ActorContext,
  text: string,
  source: "telegram" | "web" = "web",
): Promise<MemoryAssistantResult> {
  assertProject100Adult(actor);
  const intent = parseMemoryCommand(text);

  if (intent.type === "none") {
    return { handled: false, replyText: "" };
  }

  const sql = await readyClient();

  // 1. Store Intent
  if (intent.type === "store") {
    const id = crypto.randomUUID();
    const sourceRef = source === "telegram" ? "telegram" : "web_chat";

    await sql`
      insert into project100_memories (
        id, user_id, kind, category, content, source_ref, is_active
      ) values (
        ${id}, ${actor.userId}, ${intent.kind}, ${intent.category},
        ${intent.content}, ${sourceRef}, true
      )
    `;

    await recordAudit(sql, actor, {
      action: "project100.jarvis.memory.create",
      targetType: "project100_memory",
      targetId: id,
    });

    const catInfo = MEMORY_CATEGORY_LABELS[intent.category] ?? {
      label: intent.category,
      icon: "📌",
    };

    const replyText = `✅ Sparat under ${catInfo.icon} ${catInfo.label}:\n"${intent.content}"`;

    return {
      handled: true,
      replyText,
      isStore: true,
      memoryId: id,
      category: intent.category,
    };
  }

  // 2. Query Intent
  if (intent.type === "query") {
    const rawRows = await sql<MemoryRow[]>`
      select id, kind, category, content, source_ref,
             to_char(created_at, 'YYYY-MM-DD') as created_at,
             to_char(updated_at, 'YYYY-MM-DD') as updated_at
      from project100_memories
      where user_id = ${actor.userId}
        and is_active = true
      order by updated_at desc
    `;

    if (rawRows.length === 0) {
      if (intent.category) {
        const catInfo = MEMORY_CATEGORY_LABELS[intent.category];
        return {
          handled: true,
          replyText: `Hittade inga sparade uppgifter under ${catInfo?.label ?? intent.category}.`,
        };
      }
      return { handled: false, replyText: "" };
    }

    // Filter by query terms and category
    const searchTerms = intent.query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2);

    const matches = rawRows.filter((row) => {
      if (intent.category && row.category !== intent.category) {
        // If category was explicitly identified, prefer it but don't strictly exclude if keyword matches heavily
      }
      const lowerContent = row.content.toLowerCase();
      if (intent.category && row.category === intent.category) {
        if (searchTerms.length === 0) return true;
      }
      return searchTerms.some((term) => lowerContent.includes(term));
    });

    if (matches.length > 0) {
      const topMatches = matches.slice(0, 4);
      const lines = topMatches.map((m) => {
        const cat = MEMORY_CATEGORY_LABELS[m.category] ?? {
          label: m.category,
          icon: "📌",
        };
        return `• ${cat.icon} [${cat.label}] ${m.content}`;
      });

      const replyText =
        topMatches.length === 1
          ? `🔑 Sparad uppgift:\n${lines[0]}`
          : `🔑 Sparade uppgifter:\n${lines.join("\n")}`;

      return {
        handled: true,
        replyText,
        category: intent.category,
      };
    }

    if (intent.category) {
      const catInfo = MEMORY_CATEGORY_LABELS[intent.category];
      return {
        handled: true,
        replyText: `Hittade ingen sparad uppgift som matchar "${intent.query}" under ${catInfo.label}.`,
      };
    }

    return { handled: false, replyText: "" };
  }

  return { handled: false, replyText: "" };
}

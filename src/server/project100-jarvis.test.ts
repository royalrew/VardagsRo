import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  interface Call {
    text: string;
    values: unknown[];
  }

  const calls: Call[] = [];
  const state = {
    conversations: [] as {
      id: string;
      userId: string;
      title: string;
      createdAt: string;
      updatedAt: string;
    }[],
    messages: [] as {
      id: string;
      conversationId: string;
      userId: string;
      role: "user" | "assistant" | "system";
      content: string;
      sources: unknown[];
      proposals: unknown[];
      createdAt: string;
    }[],
    memories: [] as {
      id: string;
      userId: string;
      kind: string;
      category: string;
      content: string;
      sourceRef: string | null;
      isActive: boolean;
      createdAt: string;
      updatedAt: string;
    }[],
    journal: [] as {
      userId: string;
      writtenOn: string;
      sleepHours: number | null;
      energy: number | null;
      mood: number | null;
      excludedFromAi: boolean;
    }[],
  };

  function reset() {
    calls.length = 0;
    state.conversations = [
      {
        id: "conv-1",
        userId: "user-test",
        title: "Första passet",
        createdAt: "2026-08-30T10:00:00Z",
        updatedAt: "2026-08-30T10:00:00Z",
      },
      {
        id: "conv-other",
        userId: "user-elsewhere",
        title: "Privat tråd",
        createdAt: "2026-08-30T10:00:00Z",
        updatedAt: "2026-08-30T10:00:00Z",
      },
    ];

    state.messages = [
      {
        id: "msg-1",
        conversationId: "conv-1",
        userId: "user-test",
        role: "user",
        content: "Hej Jarvis, vad tränade jag igår?",
        sources: [],
        proposals: [],
        createdAt: "2026-08-30T10:01:00Z",
      },
    ];

    state.memories = [
      {
        id: "mem-1",
        userId: "user-test",
        kind: "fact",
        category: "equipment",
        content: "Tränar oftast hemma med hantlar",
        sourceRef: "Inställningar",
        isActive: true,
        createdAt: "2026-08-01T12:00:00Z",
        updatedAt: "2026-08-01T12:00:00Z",
      },
      {
        id: "mem-other",
        userId: "user-elsewhere",
        kind: "fact",
        category: "equipment",
        content: "Annan användares minne",
        sourceRef: null,
        isActive: true,
        createdAt: "2026-08-01T12:00:00Z",
        updatedAt: "2026-08-01T12:00:00Z",
      },
    ];

    state.journal = [
      {
        userId: "user-test",
        writtenOn: "2026-08-30",
        sleepHours: 8,
        energy: 4,
        mood: 4,
        excludedFromAi: false,
      },
      {
        userId: "user-test",
        writtenOn: "2026-08-29",
        sleepHours: 5,
        energy: 2,
        mood: 2,
        excludedFromAi: true, // MUST NEVER BE READ BY AI
      },
    ];
  }

  async function execute(text: string, values: unknown[]) {
    if (text.includes("from family_households")) {
      return [{ timezone: "Europe/Stockholm" }];
    }

    if (text.includes("from project100_settings")) {
      return [{ weight_goal_kg: 100, start_weight_kg: 82.0, protein_target_g: 175 }];
    }

    if (text.includes("from family_events")) {
      return [{ title: "Kvällspass", starts_at: "2026-08-31T14:00:00Z", ends_at: "2026-08-31T22:30:00Z" }];
    }

    if (text.includes("from project100_training_sessions")) {
      return [
        {
          id: "sess-1",
          session_date: "2026-08-29",
          title: "Helkroppsstyrka",
          activity_type: "gym",
          duration_seconds: 3600,
        },
      ];
    }

    if (text.includes("from project100_body_measurements")) {
      return [{ measured_on: "2026-08-30", value: 85.0 }];
    }

    if (text.includes("from project100_meals")) {
      return [{ id: "meal-1", eaten_on: "2026-08-30", title: "Kycklinggryta", protein_g: 50, kcal: 650 }];
    }

    if (text.includes("from project100_meal_batches")) {
      return [{ id: "batch-1", title: "Chili con carne", portions_remaining: 3, protein_per_portion_g: 45 }];
    }

    if (text.includes("from project100_journal_entries")) {
      const userId = values[0] as string;
      // SQL has `and excluded_from_ai = false`
      return state.journal
        .filter((j) => j.userId === userId && !j.excludedFromAi)
        .map((j) => ({
          written_on: j.writtenOn,
          sleep_hours: j.sleepHours,
          energy: j.energy,
          mood: j.mood,
        }));
    }

    if (text.includes("from project100_memories") && text.includes("select")) {
      const userId = values[0] as string;
      return state.memories
        .filter((m) => m.userId === userId)
        .map((m) => ({
          id: m.id,
          kind: m.kind,
          category: m.category,
          content: m.content,
          source_ref: m.sourceRef,
          is_active: m.isActive,
          created_at: m.createdAt,
          updated_at: m.updatedAt,
        }));
    }

    if (text.includes("from project100_conversations") && text.includes("select")) {
      const userId = values[0] as string;
      if (text.includes("where id =")) {
        const id = values[0] as string;
        const uId = values[1] as string;
        return state.conversations.filter((c) => c.id === id && c.userId === uId);
      }
      return state.conversations
        .filter((c) => c.userId === userId)
        .map((c) => ({
          id: c.id,
          title: c.title,
          created_at: c.createdAt,
          updated_at: c.updatedAt,
        }));
    }

    if (text.includes("from project100_conversation_messages") && text.includes("select")) {
      const userId = values[0] as string;
      const convId = values[1] as string;
      return state.messages
        .filter((m) => m.userId === userId && m.conversationId === convId)
        .map((m) => ({
          id: m.id,
          conversation_id: m.conversationId,
          role: m.role,
          content: m.content,
          sources: m.sources,
          proposals: m.proposals,
          created_at: m.createdAt,
        }));
    }

    if (text.includes("insert into project100_conversations")) {
      const id = values[0] as string;
      const userId = values[1] as string;
      const title = values[2] as string;
      const entry = {
        id,
        userId,
        title,
        createdAt: "2026-08-30T12:00:00Z",
        updatedAt: "2026-08-30T12:00:00Z",
      };
      state.conversations.push(entry);
      return [entry];
    }

    if (text.includes("delete from project100_conversations")) {
      const id = values[0] as string;
      const userId = values[1] as string;
      const index = state.conversations.findIndex((c) => c.id === id && c.userId === userId);
      if (index >= 0) {
        state.conversations.splice(index, 1);
        return [{ id }];
      }
      return [];
    }

    if (text.includes("insert into project100_memories")) {
      const id = values[0] as string;
      const userId = values[1] as string;
      const kind = values[2] as string;
      const category = values[3] as string;
      const content = values[4] as string;
      const sourceRef = values[5] as string | null;
      const entry = {
        id,
        userId,
        kind,
        category,
        content,
        sourceRef,
        isActive: true,
        createdAt: "2026-08-30T12:00:00Z",
        updatedAt: "2026-08-30T12:00:00Z",
      };
      state.memories.push(entry);
      return [{
        id,
        kind,
        category,
        content,
        source_ref: sourceRef,
        is_active: true,
        created_at: "2026-08-30T12:00:00Z",
        updated_at: "2026-08-30T12:00:00Z",
      }];
    }

    if (text.includes("update project100_memories")) {
      const id = values[3] as string;
      const userId = values[4] as string;
      const mem = state.memories.find((m) => m.id === id && m.userId === userId);
      if (mem) {
        if (values[0] !== null) mem.isActive = values[0] as boolean;
        if (values[1] !== null) mem.content = values[1] as string;
        if (values[2] !== null) mem.category = values[2] as string;
        return [{
          id: mem.id,
          kind: mem.kind,
          category: mem.category,
          content: mem.content,
          source_ref: mem.sourceRef,
          is_active: mem.isActive,
          created_at: mem.createdAt,
          updated_at: mem.updatedAt,
        }];
      }
      return [];
    }

    if (text.includes("delete from project100_memories")) {
      const id = values[0] as string;
      const userId = values[1] as string;
      const index = state.memories.findIndex((m) => m.id === id && m.userId === userId);
      if (index >= 0) {
        state.memories.splice(index, 1);
        return [{ id }];
      }
      return [];
    }

    if (text.includes("insert into project100_conversation_messages")) {
      const id = values[0] as string;
      const conversationId = values[1] as string;
      const userId = values[2] as string;
      const role = values[3] as "user" | "assistant";
      const content = values[4] as string;
      const sources = typeof values[5] === "string" ? JSON.parse(values[5]) : [];
      const proposals = typeof values[6] === "string" ? JSON.parse(values[6]) : [];
      state.messages.push({
        id,
        conversationId,
        userId,
        role,
        content,
        sources,
        proposals,
        createdAt: "2026-08-30T12:00:00Z",
      });
      return [{
        id,
        conversation_id: conversationId,
        user_id: userId,
        role,
        content,
        sources,
        proposals,
        created_at: "2026-08-30T12:00:00Z",
      }];
    }

    if (text.includes("update project100_conversations")) {
      return [{ id: values[0] }];
    }

    if (text.includes("family_audit_log") || text.includes("insert into app_audit_logs")) {
      return [{ id: "audit-1" }];
    }

    throw new Error(`Unexpected query in test: ${text}`);
  }

  function createTag() {
    const fn = vi.fn((strings: TemplateStringsArray | unknown[], ...values: unknown[]) => {
      if (!("raw" in strings)) return { list: [...strings] };
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      calls.push({ text, values });
      return execute(text, values);
    });
    (fn as unknown as { json: (val: unknown) => string }).json = (val: unknown) => JSON.stringify(val);
    return fn;
  }

  const sql = createTag();
  reset();
  return { calls, reset, sql, state };
});

vi.mock("@/server/database", () => ({ readyClient: async () => database.sql }));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://project100.test/database",
  demoFallbackAllowed: () => false,
  openAIConfig: () => null, // Test deterministic fallback
}));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: vi.fn() } }) }));

import {
  createProject100Conversation,
  createProject100Memory,
  deleteProject100Conversation,
  deleteProject100Memory,
  loadProject100JarvisWorkspace,
  sendProject100JarvisMessage,
  updateProject100Memory,
} from "@/server/project100-jarvis";

const CHILD = { ...TEST_ACTOR, personType: "child" as const };

describe("Project 100 Jarvis Server", () => {
  beforeEach(() => {
    database.reset();
  });

  it("denies access to non-adult actors before running any query", async () => {
    await expect(loadProject100JarvisWorkspace(CHILD)).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
      status: 403,
    });
  });

  it("loads workspace with conversations, memories, and realtime context for actor only", async () => {
    const workspace = await loadProject100JarvisWorkspace(TEST_ACTOR);

    expect(workspace.conversations.length).toBe(1);
    expect(workspace.conversations[0].id).toBe("conv-1");
    expect(workspace.memories.length).toBe(1);
    expect(workspace.memories[0].content).toContain("hantlar");
    expect(workspace.context.currentWeightKg).toBe(85.0);
    expect(workspace.context.recentJournal.length).toBe(1);
    expect(workspace.context.recentJournal[0].date).toBe("2026-08-30"); // 2026-08-29 was excluded!
  });

  it("creates, updates, and deletes controlled memories with user isolation", async () => {
    const created = await createProject100Memory(TEST_ACTOR, {
      kind: "learning",
      category: "recovery",
      content: "Behöver minst 7.5 timmars sömn efter tunga benpass",
      sourceRef: "Träningslogg",
    });
    expect(created.kind).toBe("learning");
    expect(created.content).toContain("7.5 timmar");

    const updated = await updateProject100Memory(TEST_ACTOR, created.id, {
      isActive: false,
    });
    expect(updated.isActive).toBe(false);

    const deleted = await deleteProject100Memory(TEST_ACTOR, created.id);
    expect(deleted).toBe(true);

    // Cannot delete another user's memory
    await expect(deleteProject100Memory(TEST_ACTOR, "mem-other")).rejects.toMatchObject({
      code: "MEMORY_NOT_FOUND",
      status: 404,
    });
  });

  it("sends message and returns assistant answer with linked sources", async () => {
    const result = await sendProject100JarvisMessage(TEST_ACTOR, {
      conversationId: "conv-1",
      content: "Vad är mitt nästa fokus?",
    });

    expect(result.conversationId).toBe("conv-1");
    expect(result.userMessage.content).toBe("Vad är mitt nästa fokus?");
    expect(result.assistantMessage.content).toContain("proteinmål");
    expect(result.assistantMessage.sources.length).toBeGreaterThanOrEqual(2);
  });
});

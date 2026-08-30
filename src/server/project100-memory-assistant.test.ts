import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  const calls: { text: string; values: unknown[] }[] = [];
  const state = {
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
  };

  function reset() {
    calls.length = 0;
    state.memories = [
      {
        id: "mem-1",
        userId: "user-test",
        kind: "fact",
        category: "job",
        content: "Koden till inkontinensförrådet är 2214",
        sourceRef: "telegram",
        isActive: true,
        createdAt: "2026-08-30T10:00:00Z",
        updatedAt: "2026-08-30T10:00:00Z",
      },
      {
        id: "mem-2",
        userId: "user-test",
        kind: "fact",
        category: "car",
        content: "Däckdimensionen är 205/55 R16",
        sourceRef: "web_chat",
        isActive: true,
        createdAt: "2026-08-30T10:00:00Z",
        updatedAt: "2026-08-30T10:00:00Z",
      },
    ];
  }

  async function execute(text: string, values: unknown[]) {
    if (text.includes("from project100_memories") && text.includes("select")) {
      const userId = values[0] as string;
      return state.memories
        .filter((m) => m.userId === userId && m.isActive)
        .map((m) => ({
          id: m.id,
          kind: m.kind,
          category: m.category,
          content: m.content,
          source_ref: m.sourceRef,
          created_at: "2026-08-30",
          updated_at: "2026-08-30",
        }));
    }

    if (text.includes("insert into project100_memories")) {
      const id = values[0] as string;
      const userId = values[1] as string;
      const kind = values[2] as string;
      const category = values[3] as string;
      const content = values[4] as string;
      const sourceRef = values[5] as string | null;
      state.memories.push({
        id,
        userId,
        kind,
        category,
        content,
        sourceRef,
        isActive: true,
        createdAt: "2026-08-30T12:00:00Z",
        updatedAt: "2026-08-30T12:00:00Z",
      });
      return [{ id }];
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
    (fn as unknown as { json: (val: unknown) => string }).json = (val: unknown) =>
      JSON.stringify(val);
    return fn;
  }

  const sql = createTag();
  reset();
  return { calls, reset, sql, state };
});

vi.mock("@/server/database", () => ({ readyClient: async () => database.sql }));

import { handleMemoryTextIntent } from "@/server/project100-memory-assistant";

const CHILD = { ...TEST_ACTOR, personType: "child" as const };

describe("project100-memory-assistant", () => {
  beforeEach(() => {
    database.reset();
  });

  it("blocks non-adult actors", async () => {
    await expect(
      handleMemoryTextIntent(CHILD, "Jobb - Koden är 1234"),
    ).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
      status: 403,
    });
  });

  it("stores memories via explicit prefix", async () => {
    const res = await handleMemoryTextIntent(
      TEST_ACTOR,
      "Huset - Färgkoden i hallen är Jotun 10341",
      "telegram",
    );
    expect(res.handled).toBe(true);
    expect(res.isStore).toBe(true);
    expect(res.replyText).toContain("Sparat under 🏡 Huset");
    expect(res.replyText).toContain("Färgkoden i hallen är Jotun 10341");
    expect(database.state.memories.length).toBe(3);
  });

  it("queries memories successfully", async () => {
    const res = await handleMemoryTextIntent(
      TEST_ACTOR,
      "Vad är koden till inkontinensförrådet?",
      "telegram",
    );
    expect(res.handled).toBe(true);
    expect(res.replyText).toContain("Koden till inkontinensförrådet är 2214");
    expect(res.replyText).toContain("Jobb");
  });

  it("queries short keyword queries like 'Bilen däck'", async () => {
    const res = await handleMemoryTextIntent(TEST_ACTOR, "Bilen däck", "web");
    expect(res.handled).toBe(true);
    expect(res.replyText).toContain("Däckdimensionen är 205/55 R16");
  });

  it("ignores non-memory questions", async () => {
    const res = await handleMemoryTextIntent(TEST_ACTOR, "Jobbar jag imorgon?");
    expect(res.handled).toBe(false);
  });
});

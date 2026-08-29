import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const state = { entryExists: true };

  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });

    if (text.includes("insert into project100_journal_entries")) {
      return Promise.resolve([
        {
          written_on: "2026-08-26",
          body: "Kändes starkt idag",
          mood: 4,
          energy: 3,
          sleep_hours: "7.50",
          excluded_from_ai: values[6],
          updated_at: "2026-08-26T20:14:00.000Z",
        },
      ]);
    }
    if (text.includes("delete from project100_journal_entries")) {
      return Promise.resolve(state.entryExists ? [{ written_on: "2026-08-26" }] : []);
    }
    if (text.includes("count(*)::int as total")) {
      return Promise.resolve([{ total: 42, excluded: 3 }]);
    }
    if (text.includes("from project100_journal_entries")) {
      return Promise.resolve([
        {
          written_on: "2026-08-26",
          body: "Kändes starkt idag",
          mood: 4,
          energy: 3,
          sleep_hours: "7.50",
          excluded_from_ai: false,
          updated_at: "2026-08-26T20:14:00.000Z",
        },
      ]);
    }
    if (text.includes("family_audit_log")) return Promise.resolve([]);

    throw new Error(`Unexpected query in test: ${text}`);
  });

  const begin = vi.fn(async (callback: (tx: typeof sql) => Promise<unknown>) => callback(sql));
  Object.assign(sql, { begin, json: (value: unknown) => value });
  return { begin, calls, sql, state };
});

vi.mock("@/server/database", () => ({ readyClient: async () => database.sql }));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://project100.test/database",
  demoFallbackAllowed: () => false,
}));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: vi.fn() } }) }));

import {
  deleteProject100JournalEntry,
  loadProject100Journal,
  loadProject100JournalForAssistant,
  saveProject100JournalEntry,
} from "@/server/project100-journal";

const CHILD = { ...TEST_ACTOR, personType: "child" as const };

function entry(overrides: Record<string, unknown> = {}) {
  return {
    writtenOn: "2026-08-26",
    body: "Kändes starkt idag",
    mood: 4,
    energy: 3,
    sleepHours: 7.5,
    excludedFromAi: false,
    ...overrides,
  };
}

describe("Projekt 100 journal", () => {
  beforeEach(() => {
    database.calls.length = 0;
    database.sql.mockClear();
    database.state.entryExists = true;
  });

  it("scopes every journal query to the signed-in account", async () => {
    await loadProject100Journal(TEST_ACTOR, { from: null, to: null, query: null });
    const touched = database.calls.filter((call) => call.text.includes("project100_"));

    expect(touched.length).toBeGreaterThan(0);
    for (const call of touched) {
      expect(call.text).toMatch(/user_id = \?/);
      expect(call.values).toContain(TEST_ACTOR.userId);
    }
  });

  it("keeps a child out of someone else's diary entirely", async () => {
    await expect(loadProject100Journal(CHILD)).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
      status: 403,
    });
    await expect(saveProject100JournalEntry(CHILD, entry())).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });
    await expect(deleteProject100JournalEntry(CHILD, "2026-08-26")).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });
    await expect(
      loadProject100JournalForAssistant(CHILD, "2026-01-01", "2026-08-26"),
    ).rejects.toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    expect(database.sql).not.toHaveBeenCalled();
  });

  it("never hands the assistant an entry the user marked extra private", async () => {
    // This is the whole promise of that checkbox, so the condition is asserted
    // in the statement itself rather than trusted to a later filter.
    await loadProject100JournalForAssistant(TEST_ACTOR, "2026-01-01", "2026-08-26");
    const read = database.calls.find((call) =>
      call.text.includes("from project100_journal_entries"),
    );

    expect(read?.text).toContain("excluded_from_ai = false");
    expect(read?.values).toContain(TEST_ACTOR.userId);
  });

  it("searches the writing as a bound parameter, never as spliced text", async () => {
    await loadProject100Journal(TEST_ACTOR, {
      from: null,
      to: null,
      query: "motivation') --",
    });
    const read = database.calls.find((call) => call.text.includes("plainto_tsquery"));

    expect(read?.text).toContain("plainto_tsquery('swedish', ?)");
    expect(read?.values).toContain("motivation') --");
  });

  it("reads the whole period when no search is given", async () => {
    await loadProject100Journal(TEST_ACTOR, { from: null, to: null, query: null });
    const read = database.calls.find((call) => call.text.includes("plainto_tsquery"));

    // The null query short-circuits in SQL, so one statement serves both cases.
    expect(read?.text).toContain("?::text is null");
    expect(read?.values).toContain(null);
  });

  it("keeps the private flag exactly as the user set it", async () => {
    const saved = await saveProject100JournalEntry(
      TEST_ACTOR,
      entry({ excludedFromAi: true }),
    );
    const write = database.calls.find((call) =>
      call.text.includes("insert into project100_journal_entries"),
    );

    expect(write?.values[6]).toBe(true);
    expect(saved.excludedFromAi).toBe(true);
  });

  it("rewrites the day rather than stacking a second version of it", async () => {
    await saveProject100JournalEntry(TEST_ACTOR, entry());
    const write = database.calls.find((call) =>
      call.text.includes("insert into project100_journal_entries"),
    );

    expect(write?.text).toContain("on conflict (user_id, written_on) do update");
  });

  it("refuses a diary entry about a day that has not happened", async () => {
    await expect(
      saveProject100JournalEntry(TEST_ACTOR, entry({ writtenOn: "2099-01-01" })),
    ).rejects.toMatchObject({ code: "PROJECT100_FUTURE_JOURNAL", status: 400 });
    expect(database.sql).not.toHaveBeenCalled();
  });

  it("audits that a day was written without recording a word of it", async () => {
    await saveProject100JournalEntry(TEST_ACTOR, entry());
    const audit = database.calls.find((call) => call.text.includes("family_audit_log"));
    const serialized = JSON.stringify(audit?.values ?? []);

    expect(audit?.values).toContain("project100.journal.save");
    expect(serialized).not.toContain("Kändes starkt");
  });

  it("reports a miss instead of a silent success for an empty day", async () => {
    database.state.entryExists = false;

    await expect(deleteProject100JournalEntry(TEST_ACTOR, "2026-07-01")).resolves.toBe(false);
    expect(database.calls.some((call) => call.text.includes("family_audit_log"))).toBe(false);
  });
});

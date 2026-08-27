import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    if (text.includes("select id, household_id from family_people")) {
      return Promise.resolve([{ id: "person-nora", household_id: "household-demo" }]);
    }
    if (text.includes("select id from family_people")) {
      return Promise.resolve([{ id: "person-nora" }]);
    }
    if (text.includes("insert into family_events")) return Promise.resolve([]);
    if (text.includes("update family_events")) {
      return Promise.resolve([{
        id: "event-1",
        household_id: "household-demo",
        person_id: "person-nora",
        document_id: null,
        title: "Träning flyttad",
        category: "sport",
        starts_at: "2026-08-24T15:00:00.000Z",
        ends_at: "2026-08-24T16:00:00.000Z",
        all_day: false,
        location: null,
        notes: "Ta med vatten",
        status: "confirmed",
        confidence: 1,
        source_excerpt: null,
      }]);
    }
    if (text.includes("delete from family_events")) {
      return Promise.resolve([{ id: "event-1" }]);
    }
    if (text.includes("insert into family_audit_log")) return Promise.resolve([]);
    throw new Error(`Unexpected query in test: ${text}`);
  });
  const begin = vi.fn(async (callback: (tx: typeof sql) => Promise<unknown>) => callback(sql));
  Object.assign(sql, { begin, json: (value: unknown) => value });
  return { begin, calls, sql };
});

vi.mock("postgres", () => ({ default: () => database.sql }));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://test.invalid/database",
  demoFallbackAllowed: () => false,
}));

import { removeEvent, saveManualEvent, updateManualEvent } from "@/server/database";

describe("event household scope", () => {
  beforeEach(() => {
    database.calls.length = 0;
    database.sql.mockClear();
  });

  it("requires the active household when resolving a person", async () => {
    await saveManualEvent(TEST_ACTOR, {
      personId: "person-nora",
      title: "Träning",
      category: "sport",
      startsAt: "2026-08-22T10:00:00+02:00",
      endsAt: "2026-08-22T11:00:00+02:00",
      allDay: false,
      location: null,
      notes: null,
    });

    const lookup = database.calls.find((call) =>
      call.text.includes("select id, household_id from family_people"),
    );
    expect(lookup?.text).toContain("and household_id = ?");
    expect(lookup?.values).toEqual(["person-nora", "household-demo"]);
  });

  it("scopes event deletion to the active household", async () => {
    await expect(removeEvent(TEST_ACTOR, "event-1")).resolves.toBe(true);

    const deletion = database.calls.find((call) =>
      call.text.includes("delete from family_events"),
    );
    expect(deletion?.text).toContain("and household_id = ?");
    expect(deletion?.values).toEqual(["event-1", "household-demo"]);
  });

  it("scopes updates and detaches stale document provenance", async () => {
    const saved = await updateManualEvent(TEST_ACTOR, "event-1", {
      personId: "person-nora",
      title: "Träning flyttad",
      category: "sport",
      startsAt: "2026-08-24T17:00:00+02:00",
      endsAt: "2026-08-24T18:00:00+02:00",
      allDay: false,
      location: null,
      notes: "Ta med vatten",
    });

    const update = database.calls.find((call) => call.text.includes("update family_events"));
    expect(update?.text).toContain("where id = ? and household_id = ?");
    expect(update?.text).toContain("document_id = null");
    expect(update?.text).toContain("source_excerpt = null");
    expect(update?.text).toContain("status = 'confirmed'");
    expect(update?.values.slice(-2)).toEqual(["event-1", "household-demo"]);
    expect(saved).toMatchObject({
      id: "event-1",
      documentId: null,
      sourceExcerpt: null,
      notes: "Ta med vatten",
    });
  });
});

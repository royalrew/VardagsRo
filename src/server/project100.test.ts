import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    if (text.includes("from family_households")) {
      return Promise.resolve([{ timezone: "Europe/Stockholm" }]);
    }
    if (text.includes("from family_events")) {
      return Promise.resolve([
        {
          id: "work-1",
          title: "Jobb",
          starts_at: "2026-08-25T06:00:00.000Z",
          ends_at: "2026-08-25T14:00:00.000Z",
          all_day: false,
          location: "Södra",
          document_id: "must-not-leak",
          source_excerpt: "must-not-leak",
        },
      ]);
    }
    throw new Error(`Unexpected query: ${text}`);
  });
  return { calls, sql };
});

vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://project100.test/database",
  demoFallbackAllowed: () => false,
}));
vi.mock("@/server/database", () => ({ readyClient: async () => database.sql }));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: vi.fn() } }) }));

import {
  assertProject100Adult,
  loadProject100WorkSchedule,
} from "@/server/project100";

describe("Projekt 100 work schedule", () => {
  beforeEach(() => {
    database.calls.length = 0;
    database.sql.mockClear();
  });

  it("queries only the actor's confirmed work events in the selected week", async () => {
    const schedule = await loadProject100WorkSchedule(TEST_ACTOR, "2026-08-24");
    const eventQuery = database.calls.find((call) => call.text.includes("from family_events"));

    expect(eventQuery?.text).toContain("household_id = ?");
    expect(eventQuery?.text).toContain("person_id = ?");
    expect(eventQuery?.text).toContain("category = 'work'");
    expect(eventQuery?.text).toContain("status = 'confirmed'");
    expect(eventQuery?.text).toContain("starts_at < ?");
    expect(eventQuery?.text).toContain("ends_at > ?");
    expect(eventQuery?.values.slice(0, 2)).toEqual([
      TEST_ACTOR.householdId,
      TEST_ACTOR.personId,
    ]);
    expect(schedule).toMatchObject({
      timeZone: "Europe/Stockholm",
      weekStart: "2026-08-24",
      weekEndExclusive: "2026-08-31",
      workEvents: [
        {
          id: "work-1",
          title: "Jobb",
          location: "Södra",
        },
      ],
    });
    expect(schedule.workEvents[0]).not.toHaveProperty("documentId");
    expect(schedule.workEvents[0]).not.toHaveProperty("sourceExcerpt");
  });

  it("uses a half-open timezone-aware week interval", async () => {
    await loadProject100WorkSchedule(TEST_ACTOR, "2026-08-24");
    const eventQuery = database.calls.find((call) => call.text.includes("from family_events"));
    const [to, from] = eventQuery?.values.slice(2) as Date[];

    expect(from.toISOString()).toBe("2026-08-23T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-08-30T22:00:00.000Z");
  });

  it("rejects a child before reading household or event data", async () => {
    const child = { ...TEST_ACTOR, personType: "child" as const };

    await expect(loadProject100WorkSchedule(child, "2026-08-24")).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
      status: 403,
    });
    expect(database.sql).not.toHaveBeenCalled();
  });

  it("exposes an explicit adult gate for every Project 100 data path", () => {
    expect(() => assertProject100Adult(TEST_ACTOR)).not.toThrow();
    expect(() =>
      assertProject100Adult({ ...TEST_ACTOR, personType: "child" }),
    ).toThrowError(/privat vuxenyta/);
  });
});

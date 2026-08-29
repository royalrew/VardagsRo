import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  const calls: Array<{ text: string; values: unknown[] }> = [];

  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });

    if (text.includes("from project100_journal_entries")) {
      return Promise.resolve([
        { written_on: "2026-08-26", body: "Kändes starkt idag,\noch ryggen höll", mood: 4 },
      ]);
    }
    if (text.includes("from project100_training_sessions")) {
      return Promise.resolve([
        {
          id: "session-1",
          session_date: "2026-08-26",
          title: "Helkropp hemma",
          activity_type: "strength_home",
          status: "completed",
          duration_seconds: 2_700,
        },
      ]);
    }
    if (text.includes("from project100_body_measurements")) {
      return Promise.resolve([
        { measured_on: "2026-08-26", metric: "weight", label: null, unit: "kg", value: "83.40" },
        { measured_on: "2026-08-26", metric: "waist", label: null, unit: "cm", value: "88.00" },
      ]);
    }
    if (text.includes("from project100_media")) {
      return Promise.resolve([
        { id: "media-1", captured_on: "2026-08-26", category: "body", caption: null },
        { id: "media-2", captured_on: "2026-08-25", category: "food", caption: "Ägg och gröt" },
      ]);
    }

    throw new Error(`Unexpected query in test: ${text}`);
  });

  Object.assign(sql, { json: (value: unknown) => value });
  return { calls, sql };
});

vi.mock("@/server/database", () => ({ readyClient: async () => database.sql }));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://project100.test/database",
  demoFallbackAllowed: () => false,
}));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: vi.fn() } }) }));

import { loadProject100Timeline } from "@/server/project100-timeline";

const CHILD = { ...TEST_ACTOR, personType: "child" as const };

describe("Projekt 100 private timeline", () => {
  beforeEach(() => {
    database.calls.length = 0;
    database.sql.mockClear();
  });

  it("asks each of the four sources separately, each scoped to one account", async () => {
    await loadProject100Timeline(TEST_ACTOR, { from: "2026-08-01", to: "2026-08-26" });

    expect(database.calls).toHaveLength(4);
    for (const call of database.calls) {
      expect(call.text).toMatch(/user_id = \?/);
      expect(call.values[0]).toBe(TEST_ACTOR.userId);
    }
  });

  it("keeps a child out before a single source is read", async () => {
    await expect(loadProject100Timeline(CHILD)).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
      status: 403,
    });
    expect(database.sql).not.toHaveBeenCalled();
  });

  it("weaves the four sources into one day", async () => {
    const timeline = await loadProject100Timeline(TEST_ACTOR, {
      from: "2026-08-01",
      to: "2026-08-26",
    });
    const day = timeline.days[0];

    expect(day.on).toBe("2026-08-26");
    expect(day.items.map((item) => item.kind)).toEqual([
      "journal",
      "training",
      "body",
      "media",
    ]);
  });

  it("marks a body picture sensitive so the timeline covers it too", async () => {
    const timeline = await loadProject100Timeline(TEST_ACTOR);
    const bodyPhoto = timeline.days
      .flatMap((day) => day.items)
      .find((item) => item.id === "media-media-1");
    const foodPhoto = timeline.days
      .flatMap((day) => day.items)
      .find((item) => item.id === "media-media-2");

    expect(bodyPhoto?.sensitive).toBe(true);
    expect(foodPhoto?.sensitive).toBe(false);
  });

  it("collapses a day of tape-measure readings into one line", async () => {
    // Eight measurements taken after one session must not bury the session.
    const timeline = await loadProject100Timeline(TEST_ACTOR);
    const body = timeline.days[0].items.filter((item) => item.kind === "body");

    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Vikt 83,4 kg");
    expect(body[0].detail).toBe("Midja 88 cm");
  });

  it("shows a session's real outcome, not just its title", async () => {
    const timeline = await loadProject100Timeline(TEST_ACTOR);
    const training = timeline.days[0].items.find((item) => item.kind === "training");

    expect(training?.detail).toBe("Genomfört · Styrka hemma · 45 min");
  });

  it("flattens a diary excerpt to one readable line", async () => {
    const timeline = await loadProject100Timeline(TEST_ACTOR);
    const journal = timeline.days[0].items.find((item) => item.kind === "journal");

    expect(journal?.title).toBe("Kändes starkt idag, och ryggen höll");
  });
});

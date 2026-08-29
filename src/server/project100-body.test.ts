import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const state = { entryExists: true };

  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });

    if (text.includes("delete from project100_body_entries")) {
      return Promise.resolve(state.entryExists ? [{ measured_on: values[1] }] : []);
    }
    if (text.startsWith("delete from") || text.startsWith("insert into project100_body")) {
      return Promise.resolve([]);
    }
    if (text.includes("insert into project100_settings")) {
      return Promise.resolve([
        { weight_goal_kg: "100.00", start_weight_kg: "80.00", height_cm: "182.0" },
      ]);
    }
    if (text.includes("from project100_settings")) {
      return Promise.resolve([
        { weight_goal_kg: "100.00", start_weight_kg: null, height_cm: null },
      ]);
    }
    if (text.includes("from project100_body_entries")) {
      return Promise.resolve([{ measured_on: "2026-08-26", note: "Bra ljus" }]);
    }
    if (text.includes("metric = 'weight'")) {
      return Promise.resolve([
        { measured_on: "2026-01-04", value: "80.00" },
        { measured_on: "2026-08-26", value: "83.40" },
      ]);
    }
    if (text.includes("from project100_body_measurements")) {
      return Promise.resolve([
        { measured_on: "2026-08-26", metric: "weight", label: null, unit: "kg", value: "83.40" },
        { measured_on: "2026-08-26", metric: "waist", label: null, unit: "cm", value: "88.00" },
        { measured_on: "2026-08-26", metric: "underarm", label: "Underarm", unit: "cm", value: "31.00" },
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
  deleteProject100BodyEntry,
  loadProject100BodyJourney,
  saveProject100BodyEntry,
  saveProject100Settings,
} from "@/server/project100-body";

const CHILD = { ...TEST_ACTOR, personType: "child" as const };

function entry(overrides: Record<string, unknown> = {}) {
  return {
    measuredOn: "2026-08-26",
    note: "Bra ljus",
    measurements: [
      { metric: "weight", label: null, unit: "kg" as const, value: 83.4 },
      { metric: "waist", label: null, unit: "cm" as const, value: 88 },
    ],
    ...overrides,
  };
}

describe("Projekt 100 body journey", () => {
  beforeEach(() => {
    database.calls.length = 0;
    database.sql.mockClear();
    database.state.entryExists = true;
  });

  it("scopes every body query to the signed-in account", async () => {
    await loadProject100BodyJourney(TEST_ACTOR, { from: "2026-01-01", to: "2026-08-26" });
    const touched = database.calls.filter((call) => call.text.includes("project100_"));

    expect(touched.length).toBeGreaterThan(0);
    for (const call of touched) {
      expect(call.text).toMatch(/user_id = \?/);
      expect(call.values).toContain(TEST_ACTOR.userId);
    }
  });

  it("keeps a child away from weight, measurements and the goal alike", async () => {
    await expect(loadProject100BodyJourney(CHILD)).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
      status: 403,
    });
    await expect(saveProject100BodyEntry(CHILD, entry())).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });
    await expect(deleteProject100BodyEntry(CHILD, "2026-08-26")).rejects.toMatchObject({
      code: "PROJECT100_ADULT_ONLY",
    });
    await expect(
      saveProject100Settings(CHILD, { weightGoalKg: 100, startWeightKg: null, heightCm: null }),
    ).rejects.toMatchObject({ code: "PROJECT100_ADULT_ONLY" });
    expect(database.sql).not.toHaveBeenCalled();
  });

  it("reads the whole weight line even when a short period is shown", async () => {
    // Milestones are about the road travelled, not about the window on screen.
    const journey = await loadProject100BodyJourney(TEST_ACTOR, {
      from: "2026-08-01",
      to: "2026-08-26",
    });
    const history = database.calls.find((call) => call.text.includes("metric = 'weight'"));

    expect(history?.text).not.toContain("measured_on >=");
    expect(journey.weightHistory).toEqual([
      { measuredOn: "2026-01-04", value: 80 },
      { measuredOn: "2026-08-26", value: 83.4 },
    ]);
  });

  it("falls back to the first logged weight when no start weight was set", async () => {
    const journey = await loadProject100BodyJourney(TEST_ACTOR);

    expect(journey.goal).toEqual({ weightGoalKg: 100, startWeightKg: 80, heightCm: null });
  });

  it("names an own measurement by its label and a known one by ours", async () => {
    const journey = await loadProject100BodyJourney(TEST_ACTOR);
    const labels = journey.entries[0]?.measurements.map((item) => item.label);

    expect(labels).toEqual(["Vikt", "Midja", "Underarm"]);
  });

  it("replaces the whole day so a removed measurement is really gone", async () => {
    await saveProject100BodyEntry(TEST_ACTOR, entry());
    const order = database.calls.map((call) => call.text);
    const clear = order.findIndex((text) =>
      text.includes("delete from project100_body_measurements"),
    );
    const write = order.findIndex((text) =>
      text.includes("insert into project100_body_measurements"),
    );

    expect(clear).toBeGreaterThanOrEqual(0);
    expect(write).toBeGreaterThan(clear);
    expect(database.calls[clear].values).toEqual([TEST_ACTOR.userId, "2026-08-26"]);
  });

  it("refuses a measurement taken in the future", async () => {
    await expect(
      saveProject100BodyEntry(TEST_ACTOR, entry({ measuredOn: "2099-01-01" })),
    ).rejects.toMatchObject({ code: "PROJECT100_FUTURE_MEASUREMENT", status: 400 });
    expect(database.sql).not.toHaveBeenCalled();
  });

  it("reports a miss instead of a silent success for a day with nothing on it", async () => {
    database.state.entryExists = false;

    await expect(deleteProject100BodyEntry(TEST_ACTOR, "2026-07-01")).resolves.toBe(false);
    expect(database.calls.some((call) => call.text.includes("family_audit_log"))).toBe(false);
  });

  it("audits that a day was measured without recording the numbers", async () => {
    await saveProject100BodyEntry(TEST_ACTOR, entry());
    const audit = database.calls.find((call) => call.text.includes("family_audit_log"));
    const serialized = JSON.stringify(audit?.values ?? []);

    expect(audit?.values).toContain("project100.body.save");
    expect(serialized).not.toContain("83.4");
    expect(serialized).not.toContain("Bra ljus");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_ACTOR } from "../../test/actor-fixture";
import type { GardenState } from "./garden-engine";

const db = vi.hoisted(() => {
  const states = new Map<string, GardenState>();
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    if (text.includes("pg_advisory_xact_lock")) return [];
    if (text.includes("from family_households")) return [{ timezone: "Europe/Stockholm" }];
    if (text.includes("select state")) return states.has(String(values[0])) ? [{ state: states.get(String(values[0])) }] : [];
    if (text.includes("insert into project100_gardens")) { states.set(String(values[0]), structuredClone(values[1] as GardenState)); return []; }
    throw new Error(`Unexpected SQL: ${text}`);
  });
  Object.assign(sql, { begin: async (callback: (tx: typeof sql) => Promise<unknown>) => callback(sql), json: (value: unknown) => value });
  return { sql, states, calls };
});
vi.mock("@/server/database", () => ({ readyClient: async () => db.sql }));
vi.mock("@/server/config", () => ({ databaseUrl: () => "postgresql://garden.test/db", demoFallbackAllowed: () => false, isProductionRuntime: () => false, appBaseUrl: () => "http://localhost" }));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: vi.fn() } }) }));

import { accessGarden, gardenActionSchema } from "./garden";
import { calendarDateInTimeZone } from "@/lib/dates";
import * as actorModule from "@/server/actor";
import { GET, POST } from "@/app/api/project100/garden/route";

describe("private garden storage", () => {
  beforeEach(() => { db.states.clear(); db.calls.length = 0; });
  afterEach(() => { vi.restoreAllMocks(); });

  it("does not start the streak just by visiting the page", async () => {
    expect((await accessGarden(TEST_ACTOR)).started).toBe(false);
    expect(db.states.size).toBe(0);
  });

  it("shares persisted checks across web and Telegram, isolated from another account", async () => {
    const date = calendarDateInTimeZone(new Date(), "Europe/Stockholm");
    await accessGarden(TEST_ACTOR, { action: "start", date });
    await accessGarden({ ...TEST_ACTOR, channel: "telegram" }, { action: "check", date, habit: "teeth", done: true });
    expect((await accessGarden(TEST_ACTOR)).checks).toEqual(["teeth"]);
    expect((await accessGarden({ ...TEST_ACTOR, userId: "other-user" })).checks).toEqual([]);
    for (const call of db.calls.filter(call => call.text.includes("select state"))) expect(call.text).toContain("where user_id = ? for update");
    expect(db.calls[0].text).toContain("pg_advisory_xact_lock");
    expect(db.calls[0].values[0]).toBe(`garden:${TEST_ACTOR.userId}`);
  });

  it("rejects children, viewers writing, and identity injection before database writes", async () => {
    await expect(accessGarden({ ...TEST_ACTOR, personType: "child" })).rejects.toMatchObject({ status: 403 });
    await expect(accessGarden({ ...TEST_ACTOR, role: "viewer" }, { action: "start", date: "2026-09-10" })).rejects.toMatchObject({ status: 403 });
    expect(gardenActionSchema.safeParse({ action: "check", date: "2026-09-10", habit: "move", done: true, userId: "someone-else" }).success).toBe(false);
    expect(db.calls).toHaveLength(0);
  });

  it("does not create a garden from an undated, invalid or stale button", async () => {
    await expect(accessGarden(TEST_ACTOR, { action: "start", date: "2000-01-01" })).rejects.toMatchObject({ status: 409 });
    expect(gardenActionSchema.safeParse({ action: "start", date: "2026-02-30" }).success).toBe(false);
    expect(db.states.size).toBe(0);
  });

  it("requires a session and rejects cross-site mutations at the API boundary", async () => {
    expect((await GET(new Request("http://localhost/api/project100/garden"))).status).toBe(401);
    vi.spyOn(actorModule, "requireActor").mockResolvedValue(TEST_ACTOR);
    const response = await POST(new Request("http://localhost/api/project100/garden", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://other.example" },
      body: JSON.stringify({ action: "start", date: "2026-09-10" }),
    }));
    expect(response.status).toBe(403);
    expect(db.states.size).toBe(0);
  });

  it("returns a private, uncached view through the same-origin API", async () => {
    vi.spyOn(actorModule, "requireActor").mockResolvedValue(TEST_ACTOR);
    const date = calendarDateInTimeZone(new Date(), "Europe/Stockholm");
    const response = await POST(new Request("http://localhost/api/project100/garden", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ action: "start", date }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ started: true, date, checks: [], streak: 0 });
    expect((await GET(new Request("http://localhost/api/project100/garden"))).status).toBe(200);
  });
});

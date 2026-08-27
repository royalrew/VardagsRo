import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const state = { personCount: 0, events: 0, tasks: 0, documents: 0, missing: false };
  const personRow = (overrides: Record<string, unknown> = {}) => ({
    id: "person-1",
    household_id: "household-demo",
    name: "Nora",
    role: "Jag",
    person_type: "adult",
    aliases: [],
    initials: "N",
    color: "#476b5b",
    tint: "#dfece4",
    ...overrides,
  });
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    if (text.includes("count(*)::text as count from family_people")) {
      return Promise.resolve([{ count: String(state.personCount) }]);
    }
    if (text.includes("select id from family_people") && text.includes("for update")) {
      return Promise.resolve(state.missing ? [] : [{ id: String(values[0]) }]);
    }
    if (text.includes("as events")) {
      return Promise.resolve([
        {
          events: String(state.events),
          tasks: String(state.tasks),
          documents: String(state.documents),
        },
      ]);
    }
    if (text.includes("from family_people where id =")) {
      return Promise.resolve(state.missing ? [] : [personRow({ id: String(values[0]) })]);
    }
    if (text.includes("insert into family_people")) {
      return Promise.resolve([
        personRow({
          id: String(values[0]),
          name: String(values[2]),
          role: String(values[3]),
          person_type: String(values[4]),
          initials: String(values[6]),
          color: String(values[7]),
          tint: String(values[8]),
        }),
      ]);
    }
    if (text.includes("update family_people")) {
      return Promise.resolve([
        personRow({
          name: String(values[0]),
          role: String(values[1]),
          person_type: String(values[2]),
          initials: String(values[4]),
        }),
      ]);
    }
    if (text.includes("delete from family_people")) return Promise.resolve([]);
    if (text.includes("update family_households")) {
      return Promise.resolve(state.missing ? [] : [{ name: String(values[0]) }]);
    }
    if (text.includes("insert into family_audit_log")) return Promise.resolve([]);
    throw new Error(`Unexpected query in test: ${text}`);
  });
  const begin = vi.fn(async (callback: (tx: typeof sql) => Promise<unknown>) => callback(sql));
  Object.assign(sql, { begin, json: (value: unknown) => value });
  return { begin, calls, sql, state };
});

vi.mock("postgres", () => ({ default: () => database.sql }));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://people.test/database",
  demoFallbackAllowed: () => false,
}));

import { createPerson, removePerson, updateHouseholdName, updatePerson } from "@/server/database";

describe("family member management", () => {
  beforeEach(() => {
    database.calls.length = 0;
    database.sql.mockClear();
    database.begin.mockClear();
    database.state.personCount = 0;
    database.state.events = 0;
    database.state.tasks = 0;
    database.state.documents = 0;
    database.state.missing = false;
  });

  it("creates a person in the active household with derived initials and a palette colour", async () => {
    const person = await createPerson(TEST_ACTOR, { name: "Nora Berg", role: "Jag", personType: "adult", aliases: [] });
    const insert = database.calls.find((call) => call.text.includes("insert into family_people"));

    expect(insert?.values[1]).toBe("household-demo");
    expect(insert?.values[6]).toBe("N");
    expect(person).toMatchObject({ householdId: "household-demo", initials: "N" });
    expect(person.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("gives the next family member a different colour", async () => {
    const first = await createPerson(TEST_ACTOR, { name: "Nora", role: "Jag", personType: "adult", aliases: [] });
    database.state.personCount = 1;
    const second = await createPerson(TEST_ACTOR, { name: "Mikael", role: "Pappa", personType: "adult", aliases: [] });

    expect(second.color).not.toBe(first.color);
  });

  it("recomputes initials when the name changes but keeps the colour", async () => {
    const saved = await updatePerson(TEST_ACTOR, "person-1", { name: "Ida" });
    const update = database.calls.find((call) => call.text.includes("update family_people"));

    expect(update?.text).toContain("where id = ? and household_id = ?");
    expect(update?.values[4]).toBe("I");
    expect(update?.text).not.toContain("color =");
    expect(saved.color).toBe("#476b5b");
  });

  it("refuses to delete a person who still has calendar posts or tasks", async () => {
    database.state.events = 3;
    database.state.tasks = 1;

    await expect(removePerson(TEST_ACTOR, "person-1")).rejects.toMatchObject({
      status: 409,
      code: "PERSON_NOT_EMPTY",
    });
    // The schema cascades events and tasks, so the guard is the only thing
    // standing between a mis-click and a deleted calendar.
    expect(database.calls.some((call) => call.text.includes("delete from family_people"))).toBe(false);
  });

  it("names what is left so the family knows what to move first", async () => {
    database.state.events = 1;
    database.state.documents = 2;

    await expect(removePerson(TEST_ACTOR, "person-1")).rejects.toMatchObject({
      message: expect.stringContaining("1 kalenderpost"),
    });
    await expect(removePerson(TEST_ACTOR, "person-1")).rejects.toMatchObject({
      message: expect.stringContaining("2 dokument"),
    });
  });

  it("deletes a person with nothing attached, scoped to the household", async () => {
    await removePerson(TEST_ACTOR, "person-1");
    const remove = database.calls.find((call) => call.text.includes("delete from family_people"));

    expect(database.begin).toHaveBeenCalledOnce();
    expect(remove?.text).toContain("where id = ? and household_id = ?");
    expect(remove?.values).toEqual(["person-1", "household-demo"]);
  });

  it("reports a missing person instead of silently doing nothing", async () => {
    database.state.missing = true;

    await expect(removePerson(TEST_ACTOR, "person-gone")).rejects.toMatchObject({
      status: 404,
      code: "PERSON_NOT_FOUND",
    });
    await expect(updatePerson(TEST_ACTOR, "person-gone", { name: "Ida" })).rejects.toMatchObject({
      status: 404,
      code: "PERSON_NOT_FOUND",
    });
  });

  it("renames the household without touching another one", async () => {
    const name = await updateHouseholdName(TEST_ACTOR, { name: "Familjen Berg" });
    const update = database.calls.find((call) => call.text.includes("update family_households"));

    expect(name).toBe("Familjen Berg");
    expect(update?.values).toEqual(["Familjen Berg", "household-demo"]);
  });
});

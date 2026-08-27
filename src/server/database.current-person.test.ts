import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_ACTOR } from "../../test/actor-fixture";

const database = vi.hoisted(() => {
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    void values;
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    if (text.includes("from family_households")) {
      return Promise.resolve([
        { id: "household-real", name: "Familjen", timezone: "Europe/Stockholm" },
      ]);
    }
    if (text.includes("from family_people")) {
      return Promise.resolve([
        {
          id: "person-nora",
          household_id: "household-real",
          name: "Nora",
          role: "Jag",
          person_type: "adult",
          aliases: [],
          initials: "J",
          color: "#111111",
          tint: "#eeeeee",
        },
        {
          id: "person-mikael",
          household_id: "household-real",
          name: "Mikael",
          role: "Mamma",
          person_type: "adult",
          aliases: [],
          initials: "H",
          color: "#222222",
          tint: "#dddddd",
        },
      ]);
    }
    return Promise.resolve([]);
  });
  return { sql };
});

vi.mock("postgres", () => ({ default: () => database.sql }));
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://current-person.test/database",
  demoFallbackAllowed: () => false,
}));

import { loadDashboard } from "@/server/database";

describe('who "jag" means', () => {
  beforeEach(() => {
    database.sql.mockClear();
  });

  it("is the signed-in member, not whoever holds the role called Jag", async () => {
    const data = await loadDashboard({
      ...TEST_ACTOR,
      householdId: "household-real",
      personId: "person-mikael",
    });

    expect(data.currentPersonId).toBe("person-mikael");
  });

  it("still resolves correctly when the signed-in member does hold that role", async () => {
    const data = await loadDashboard({
      ...TEST_ACTOR,
      householdId: "household-real",
      personId: "person-nora",
    });

    expect(data.currentPersonId).toBe("person-nora");
  });

  it("reads the household from the actor rather than a constant", async () => {
    await loadDashboard({ ...TEST_ACTOR, householdId: "household-real" });

    const householdQuery = database.sql.mock.calls.find((call) =>
      String(call[0].join("?")).includes("from family_households"),
    );
    expect(householdQuery?.[1]).toBe("household-real");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const state = {
    session: null as { user: { id: string } } | null,
    membership: null as Record<string, unknown> | null,
  };
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("?").replace(/\s+/g, " ").trim(), values });
    return Promise.resolve(state.membership ? [state.membership] : []);
  });
  return { calls, sql, state };
});

vi.mock("@/server/auth", () => ({
  getAuth: () => ({ api: { getSession: vi.fn(async () => harness.state.session) } }),
}));
vi.mock("@/server/database", () => ({
  readyClient: async () => harness.sql,
}));
// A configured database keeps the no-database development fallback out of the
// way, so these tests exercise the real session path.
vi.mock("@/server/config", () => ({
  databaseUrl: () => "postgresql://actor.test/database",
  demoFallbackAllowed: () => false,
}));

import {
  assertCanManageHousehold,
  assertCanMutate,
  requireActor,
  requireTelegramActor,
} from "@/server/actor";
import type { ActorContext } from "@/server/authorization-types";
import { AppError } from "@/server/errors";

const MEMBERSHIP = {
  membership_id: "membership-1",
  user_id: "user-hanni",
  household_id: "household-real",
  person_id: "person-hanni",
  role: "adult",
  person_type: "adult",
};

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: "user-1",
    membershipId: "membership-1",
    householdId: "household-1",
    personId: "person-1",
    role: "adult",
    personType: "adult",
    channel: "web",
    ...overrides,
  };
}

describe("requireActor", () => {
  beforeEach(() => {
    harness.calls.length = 0;
    harness.sql.mockClear();
    harness.state.session = null;
    harness.state.membership = null;
  });

  it("rejects a request without a session", async () => {
    await expect(requireActor(new Request("http://localhost:3000/api/tasks"))).rejects.toMatchObject(
      { status: 401, code: "NOT_AUTHENTICATED" },
    );
  });

  it("rejects a signed-in user who belongs to no household", async () => {
    harness.state.session = { user: { id: "user-drifting" } };

    await expect(requireActor(new Request("http://localhost:3000/api/tasks"))).rejects.toMatchObject(
      { status: 403, code: "NO_HOUSEHOLD_MEMBERSHIP" },
    );
  });

  it("derives household and person from the membership row", async () => {
    harness.state.session = { user: { id: "user-hanni" } };
    harness.state.membership = MEMBERSHIP;

    await expect(requireActor(new Request("http://localhost:3000/api/tasks"))).resolves.toEqual({
      userId: "user-hanni",
      membershipId: "membership-1",
      householdId: "household-real",
      personId: "person-hanni",
      role: "adult",
      personType: "adult",
      channel: "web",
    });
  });

  it("ignores a household the caller supplies in the request", async () => {
    harness.state.session = { user: { id: "user-hanni" } };
    harness.state.membership = MEMBERSHIP;

    const forged = new Request("http://localhost:3000/api/tasks?householdId=household-victim", {
      method: "POST",
      headers: { "x-household-id": "household-victim" },
      body: JSON.stringify({ householdId: "household-victim", personId: "person-victim" }),
    });

    const resolved = await requireActor(forged);

    expect(resolved.householdId).toBe("household-real");
    expect(resolved.personId).toBe("person-hanni");
    expect(harness.calls[0]?.values).toEqual(["user-hanni"]);
  });

  it("looks the person up inside the same household as the membership", async () => {
    harness.state.session = { user: { id: "user-hanni" } };
    harness.state.membership = MEMBERSHIP;

    await requireActor(new Request("http://localhost:3000/api/tasks"));

    expect(harness.calls[0]?.text).toContain(
      "on p.id = m.person_id and p.household_id = m.household_id",
    );
  });
});

describe("requireTelegramActor", () => {
  beforeEach(() => {
    harness.calls.length = 0;
    harness.state.membership = null;
  });

  it("marks the channel so audit rows can tell the bot apart from the browser", async () => {
    harness.state.membership = MEMBERSHIP;

    await expect(requireTelegramActor("user-hanni")).resolves.toMatchObject({
      householdId: "household-real",
      channel: "telegram",
    });
  });

  it("refuses a linked account without a membership", async () => {
    await expect(requireTelegramActor("user-hanni")).rejects.toBeInstanceOf(AppError);
  });
});

describe("household permissions", () => {
  it("lets owners and adults change the household", () => {
    expect(() => assertCanMutate(actor({ role: "owner" }))).not.toThrow();
    expect(() => assertCanMutate(actor({ role: "adult" }))).not.toThrow();
  });

  it("keeps a viewer read-only", () => {
    expect(() => assertCanMutate(actor({ role: "viewer" }))).toThrowError(
      expect.objectContaining({ code: "READ_ONLY_MEMBER" }),
    );
  });

  it("reserves household management for the owner", () => {
    expect(() => assertCanManageHousehold(actor({ role: "owner" }))).not.toThrow();
    expect(() => assertCanManageHousehold(actor({ role: "adult" }))).toThrowError(
      expect.objectContaining({ code: "OWNER_REQUIRED" }),
    );
    expect(() => assertCanManageHousehold(actor({ role: "viewer" }))).toThrowError(
      expect.objectContaining({ code: "OWNER_REQUIRED" }),
    );
  });
});
